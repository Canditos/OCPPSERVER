import unittest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, patch

from sqlalchemy import inspect, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from api.transactions import list_transactions
from database import Base
from models.charger import Charger, Connector
from models.transaction import MeterValue, Transaction
from ocpp_server.charge_point import (
    ChargePoint,
    reconcile_duplicate_active_transactions,
    reconcile_stale_active_transactions,
)


class TransactionReconciliationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with self.engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)

    async def asyncTearDown(self):
        await self.engine.dispose()

    async def test_duplicate_reconciliation_keeps_only_newest_transaction(self):
        now = datetime.utcnow()
        async with self.sessions() as session:
            charger = Charger(charge_point_id="CP-1", status="Charging")
            session.add(charger)
            await session.flush()
            session.add(Connector(charger_id=charger.id, connector_id=1, status="Charging"))
            for index, minutes_ago in enumerate((30, 20, 10), start=1):
                session.add(
                    Transaction(
                        transaction_id=index,
                        charger_id=charger.id,
                        charge_point_id=charger.charge_point_id,
                        connector_id=1,
                        id_tag="TAG",
                        meter_start=index * 100,
                        start_time=now - timedelta(minutes=minutes_ago),
                        status="Active",
                    )
                )
            await session.commit()

            closed = await reconcile_duplicate_active_transactions(session)

            self.assertEqual(closed, 2)
            rows = (
                await session.execute(
                    Transaction.__table__.select().order_by(Transaction.start_time)
                )
            ).mappings().all()
            self.assertEqual([row["status"] for row in rows], ["Completed", "Completed", "Active"])

    async def test_stale_reconciliation_only_closes_available_connector(self):
        now = datetime.utcnow()
        async with self.sessions() as session:
            charger = Charger(charge_point_id="CP-2", status="Charging")
            session.add(charger)
            await session.flush()
            session.add_all(
                [
                    Connector(charger_id=charger.id, connector_id=1, status="Available"),
                    Connector(charger_id=charger.id, connector_id=2, status="Charging"),
                    Transaction(
                        transaction_id=10,
                        charger_id=charger.id,
                        charge_point_id=charger.charge_point_id,
                        connector_id=1,
                        id_tag="TAG-1",
                        meter_start=1000,
                        start_time=now - timedelta(hours=1),
                        status="Active",
                    ),
                    Transaction(
                        transaction_id=11,
                        charger_id=charger.id,
                        charge_point_id=charger.charge_point_id,
                        connector_id=2,
                        id_tag="TAG-2",
                        meter_start=2000,
                        start_time=now - timedelta(hours=1),
                        status="Active",
                    ),
                ]
            )
            await session.commit()

            closed = await reconcile_stale_active_transactions(session, charger.charge_point_id)

            self.assertEqual(closed, 1)
            rows = (
                await session.execute(select(Transaction).order_by(Transaction.connector_id))
            ).scalars().all()
            self.assertEqual(rows[0].status, "Completed")
            self.assertEqual(rows[0].meter_stop, rows[0].meter_start)
            self.assertEqual(rows[1].status, "Active")

    async def test_transaction_list_uses_latest_energy_without_loading_history(self):
        now = datetime.utcnow()
        async with self.sessions() as session:
            charger = Charger(charge_point_id="CP-3", status="Available")
            session.add(charger)
            await session.flush()
            transaction = Transaction(
                transaction_id=20,
                charger_id=charger.id,
                charge_point_id=charger.charge_point_id,
                connector_id=1,
                id_tag="TAG",
                meter_start=1000,
                meter_stop=1500,
                start_time=now - timedelta(minutes=10),
                stop_time=now,
                status="Completed",
            )
            session.add(transaction)
            await session.flush()
            session.add_all(
                [
                    MeterValue(
                        transaction_id=transaction.id,
                        charger_id=charger.id,
                        connector_id=1,
                        timestamp=now - timedelta(minutes=5),
                        measurand="Energy.Active.Import.Register",
                        value=2000,
                        unit="Wh",
                    ),
                    MeterValue(
                        transaction_id=transaction.id,
                        charger_id=charger.id,
                        connector_id=1,
                        timestamp=now,
                        measurand="Energy.Active.Import.Register",
                        value=3000,
                        unit="Wh",
                    ),
                ]
            )
            await session.commit()

            result = await list_transactions(
                cp_id=None,
                status=None,
                limit=100,
                include_empty=False,
                db=session,
            )

            self.assertEqual(len(result), 1)
            self.assertEqual(result[0].energy_kwh, 2.0)

    async def test_duplicate_stop_recovers_late_ocmf(self):
        now = datetime.utcnow()
        async with self.sessions() as session:
            charger = Charger(charge_point_id="CP-4", status="Available")
            session.add(charger)
            await session.flush()
            session.add(
                Transaction(
                    transaction_id=30,
                    charger_id=charger.id,
                    charge_point_id=charger.charge_point_id,
                    connector_id=1,
                    id_tag="TAG",
                    meter_start=1000,
                    meter_stop=2000,
                    start_time=now - timedelta(minutes=10),
                    stop_time=now,
                    status="Completed",
                )
            )
            await session.commit()

        raw_ocmf = 'OCMF|{"FV":"1.0"}|{"SA":"ECDSA","SD":"signature"}'
        charge_point = ChargePoint("CP-4", AsyncMock())
        charge_point._log_message = AsyncMock()

        async def apply_ocmf(db, tx, connector_id, payload):
            self.assertEqual(connector_id, 1)
            self.assertEqual(payload, raw_ocmf)
            tx.ocmf_stop_raw = payload

        charge_point._apply_ocmf_to_transaction = AsyncMock(side_effect=apply_ocmf)
        with patch("ocpp_server.charge_point.AsyncSessionLocal", self.sessions):
            await charge_point.on_stop_transaction(
                transaction_id=30,
                meter_stop=2000,
                timestamp=now.isoformat(),
                transaction_data=[
                    {
                        "sampledValue": [
                            {"format": "SignedData", "value": raw_ocmf}
                        ]
                    }
                ],
            )

        charge_point._apply_ocmf_to_transaction.assert_awaited_once()
        async with self.sessions() as session:
            tx = (
                await session.execute(
                    select(Transaction).where(Transaction.transaction_id == 30)
                )
            ).scalar_one()
            self.assertEqual(tx.ocmf_stop_raw, raw_ocmf)

    def test_large_history_relationships_are_not_implicitly_loaded(self):
        self.assertEqual(inspect(Charger).relationships.transactions.lazy, "raise")
        self.assertEqual(inspect(Charger).relationships.messages.lazy, "raise")
        self.assertEqual(inspect(Transaction).relationships.meter_values.lazy, "raise")
        self.assertTrue(
            any(
                index.name == "ix_meter_values_transaction_measurand_timestamp"
                for index in MeterValue.__table__.indexes
            )
        )


if __name__ == "__main__":
    unittest.main()

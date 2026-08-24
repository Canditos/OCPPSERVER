import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

stdin, stdout, stderr = ssh.exec_command("echo canditos | sudo -S docker ps --filter name=backend --format '{{.ID}}'")
cid = stdout.read().decode('utf-8').strip().split('\n')[0]

pycode = """
import asyncio
from database import AsyncSessionLocal
from models.charging_profile import ChargingProfile
from models.charger import OcppMessage
from sqlalchemy import select

async def run():
    async with AsyncSessionLocal() as s:
        r = await s.execute(select(ChargingProfile))
        for p in r.scalars().all():
            print("PROFILE_DB:", p.id, p.profile_id, p.name, p.purpose, "connector:", p.connector_id, "unit:", p.charging_rate_unit, "deployed:", p.is_deployed, "schedule:", p.schedule_dict())
        
        r2 = await s.execute(
            select(OcppMessage)
            .where(OcppMessage.action.in_(["SetChargingProfile", "GetCompositeSchedule", "ClearChargingProfile"]))
            .order_by(OcppMessage.timestamp.desc())
            .limit(10)
        )
        for m in r2.scalars().all():
            print(f"MSG: [{m.timestamp}] {m.direction} {m.action} -> {m.payload}")

asyncio.run(run())
"""

sftp = ssh.open_sftp()
with sftp.file('/tmp/dump_sc.py', 'w') as f:
    f.write(pycode)
sftp.close()

stdin, stdout, stderr = ssh.exec_command(f"echo canditos | sudo -S docker cp /tmp/dump_sc.py {cid}:/app/dump_sc.py && echo canditos | sudo -S docker exec {cid} python /app/dump_sc.py")
print("OUT:\n", stdout.read().decode('utf-8'))
print("ERR:\n", stderr.read().decode('utf-8'))
ssh.close()

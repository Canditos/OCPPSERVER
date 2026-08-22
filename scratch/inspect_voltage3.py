import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

stdin, stdout, stderr = ssh.exec_command('docker ps --format "{{.Names}}"')
names = stdout.read().decode('utf-8').strip().splitlines()
print("CONTAINERS:", names)
backend_container = [n for n in names if "backend" in n][0]
print("BACKEND:", backend_container)

cmd = f"""docker exec {backend_container} python -c "
import asyncio
from database import AsyncSessionLocal, engine
from models.transaction import MeterValue, Transaction
from models.charger import OcppMessage
from sqlalchemy import select

async def main():
    async with AsyncSessionLocal() as db:
        res = await db.execute(select(OcppMessage).where(OcppMessage.action == 'MeterValues').order_by(OcppMessage.id.desc()).limit(5))
        msgs = res.scalars().all()
        for m in msgs:
            print('--- MSG ---', m.charge_point_id, m.action)
            print(m.payload)

asyncio.run(main())
" """

stdin, stdout, stderr = ssh.exec_command(cmd)
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))

ssh.close()

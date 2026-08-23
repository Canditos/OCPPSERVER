import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

stdin, stdout, stderr = ssh.exec_command("echo canditos | sudo -S docker ps --filter name=backend --format '{{.ID}}'")
cid = stdout.read().decode('utf-8').strip().split('\n')[0]

pycode = """
import asyncio
from database import AsyncSessionLocal
from models.charger import OcppMessage
from sqlalchemy import select

async def run():
    async with AsyncSessionLocal() as s:
        r = await s.execute(
            select(OcppMessage)
            .order_by(OcppMessage.timestamp.desc())
            .limit(30)
        )
        for m in reversed(r.scalars().all()):
            print(f"[{m.timestamp}] {m.direction} {m.action} -> {m.payload}")

asyncio.run(run())
"""

sftp = ssh.open_sftp()
with sftp.file('/tmp/dump_in.py', 'w') as f:
    f.write(pycode)
sftp.close()

stdin, stdout, stderr = ssh.exec_command(f"echo canditos | sudo -S docker cp /tmp/dump_in.py {cid}:/app/dump_in.py && echo canditos | sudo -S docker exec {cid} python /app/dump_in.py")
print("OUT:\n", stdout.read().decode('utf-8'))
ssh.close()

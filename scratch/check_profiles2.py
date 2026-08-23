import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

stdin, stdout, stderr = ssh.exec_command("echo canditos | sudo -S docker ps --filter name=backend --format '{{.ID}}'")
cid = stdout.read().decode('utf-8').strip().split('\n')[0]
print("CID:", cid)

stdin, stdout, stderr = ssh.exec_command(f"echo canditos | sudo -S docker exec {cid} python -c \"import asyncio; from database import async_session; from models.smart_charging import SmartChargingProfile; from sqlalchemy import select; async def run():\n async with async_session() as s:\n  r = await s.execute(select(SmartChargingProfile))\n  for p in r.scalars().all():\n   print(f'PROFIL: {p.profile_id} - {p.name} - {p.purpose} - conn:{p.connector_id} - {p.periods}')\nasyncio.run(run())\"")
print("OUT:", stdout.read().decode('utf-8'))
print("ERR:", stderr.read().decode('utf-8'))
ssh.close()

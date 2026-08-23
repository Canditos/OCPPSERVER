import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

inner_script = '''
import asyncio
from database import async_session
from models.smart_charging import SmartChargingProfile
from models.ocpp_message import OcppMessage
from sqlalchemy import select

async def main():
    async with async_session() as session:
        print("=== SMART CHARGING PROFILES ===")
        r = await session.execute(select(SmartChargingProfile))
        for p in r.scalars().all():
            print(f"ID:{p.id} | prof_id:{p.profile_id} | name:{p.name} | purpose:{p.purpose} | conn:{p.connector_id} | unit:{p.charging_rate_unit} | deployed:{p.is_deployed} | periods:{p.periods}")
        
        print("=== RECENT SMART CHARGING MESSAGES ===")
        r2 = await session.execute(
            select(OcppMessage)
            .where(OcppMessage.action.in_(["SetChargingProfile", "GetCompositeSchedule", "ClearChargingProfile"]))
            .order_by(OcppMessage.timestamp.desc())
            .limit(10)
        )
        for m in r2.scalars().all():
            print(f"[{m.timestamp}] {m.direction} {m.action} -> {m.payload}")

asyncio.run(main())
'''

# write to remote file and execute
sftp = ssh.open_sftp()
with sftp.file('/tmp/check_sc.py', 'w') as f:
    f.write(inner_script)
sftp.close()

stdin, stdout, stderr = ssh.exec_command("echo canditos | sudo -S docker cp /tmp/check_sc.py $(echo canditos | sudo -S docker ps -q --filter name=backend | head -n 1):/tmp/check_sc.py && echo canditos | sudo -S docker exec $(echo canditos | sudo -S docker ps -q --filter name=backend | head -n 1) python /tmp/check_sc.py")
print(stdout.read().decode('utf-8'))
ssh.close()

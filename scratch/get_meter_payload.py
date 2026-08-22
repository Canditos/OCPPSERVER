import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

channel = ssh.invoke_shell()
channel.send("sudo docker exec backend-d8j36rc0d2vizu18z7kqwf2f-231455677240 python -c \"\n"
             "import asyncio\n"
             "from database import AsyncSessionLocal\n"
             "from models.charger import OcppMessage\n"
             "from sqlalchemy import select\n"
             "import json\n"
             "async def main():\n"
             "    async with AsyncSessionLocal() as db:\n"
             "        res = await db.execute(select(OcppMessage).where(OcppMessage.action == 'MeterValues').order_by(OcppMessage.id.desc()).limit(3))\n"
             "        for m in res.scalars().all():\n"
             "            print('=== MSG ===', m.charge_point_id)\n"
             "            print(json.dumps(json.loads(m.payload), indent=2))\n"
             "asyncio.run(main())\n"
             "\"\n")
time.sleep(1)
channel.send("canditos\n")
time.sleep(3)
output = channel.recv(10000).decode('utf-8')
print(output)
ssh.close()

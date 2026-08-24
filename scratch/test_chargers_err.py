import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

stdin, stdout, stderr = ssh.exec_command(
    "echo canditos | sudo -S docker exec backend-d8j36rc0d2vizu18z7kqwf2f-233824743344 python -c \""
    "import asyncio\n"
    "from database import AsyncSessionLocal\n"
    "from api.chargers import list_chargers\n"
    "async def test():\n"
    "    async with AsyncSessionLocal() as db:\n"
    "        try:\n"
    "            res = await list_chargers(db)\n"
    "            print('SUCCESS', res)\n"
    "        except Exception as e:\n"
    "            import traceback\n"
    "            traceback.print_exc()\n"
    "asyncio.run(test())\n"
    "\""
)
out = stdout.read().decode('utf-8', errors='replace') + stderr.read().decode('utf-8', errors='replace')
print("=== PYTHON TRACEBACK ===")
print(out)

ssh.close()

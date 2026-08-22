import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

cmd = """
echo canditos | sudo -S docker exec $(echo canditos | sudo -S docker ps -q --filter name=backend) python -c "
import sqlite3, json

conn = sqlite3.connect('ocpp16.db')
c = conn.cursor()

print('=== TABLES ===')
for r in c.execute(\\\"SELECT name FROM sqlite_master WHERE type='table'\\\"):
    print(r)

print('\\n=== LAST 10 METER_VALUES IN DB ===')
for r in c.execute('SELECT transaction_id, connector_id, timestamp, measurand, phase, unit, value FROM meter_values ORDER BY id DESC LIMIT 10'):
    print(r)

print('\\n=== LAST 5 OCPP MESSAGES (METER VALUES) ===')
for r in c.execute(\\\"SELECT charge_point_id, action, payload FROM ocpp_messages WHERE action='MeterValues' ORDER BY id DESC LIMIT 3\\\"):
    print(r[0], r[1])
    try:
        data = json.loads(r[2])
        print(json.dumps(data, indent=2))
    except:
        print(r[2])

conn.close()
"
"""

stdin, stdout, stderr = ssh.exec_command(cmd)
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))

ssh.close()

import sys
import paramiko
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

script_content = '''
import sqlite3

conn = sqlite3.connect('/var/lib/docker/volumes/d8j36rc0d2vizu18z7kqwf2f_ocpp-data/_data/ocpp16.db')
conn.row_factory = sqlite3.Row
c = conn.cursor()

print("=== AVAILABILITY LOGS GROUPED FOR chargerPT8 ===")
for r in c.execute('SELECT status, error_code, count(*) as cnt FROM availability_logs WHERE charge_point_id = "chargerPT8" GROUP BY status, error_code'):
    print(dict(r))

print("=== LAST 20 AVAILABILITY LOGS ===")
for r in c.execute('SELECT id, connector_id, status, error_code, info, timestamp FROM availability_logs WHERE charge_point_id = "chargerPT8" ORDER BY timestamp DESC LIMIT 20'):
    print(dict(r))

print("=== TRANSACTIONS FOR chargerPT8 ===")
for r in c.execute('SELECT transaction_id, connector_id, status, meter_start, meter_stop, start_time, stop_time, stop_reason FROM transactions WHERE charge_point_id = "chargerPT8"'):
    print(dict(r))
'''

sftp = ssh.open_sftp()
with sftp.open('/tmp/inspect_uptime.py', 'w') as f:
    f.write(script_content)
sftp.close()

stdin, stdout, stderr = ssh.exec_command("""
echo canditos | sudo -S python3 /tmp/inspect_uptime.py
""")
print(stdout.read().decode('utf-8', errors='ignore'))
print(stderr.read().decode('utf-8', errors='ignore'))

ssh.close()

import sys
import paramiko
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

def run_sudo(cmd):
    stdin, stdout, stderr = ssh.exec_command(f"sudo -S {cmd}")
    stdin.write("canditos\n")
    stdin.flush()
    return stdout.read().decode('utf-8', errors='ignore'), stderr.read().decode('utf-8', errors='ignore')

out, err = run_sudo("""docker exec backend-d8j36rc0d2vizu18z7kqwf2f-150522216793 python -c "
import sqlite3
import json

conn = sqlite3.connect('./data/ocpp16.db')
conn.row_factory = sqlite3.Row
c = conn.cursor()

row = c.execute("SELECT id, payload FROM ocpp_messages_log WHERE action = 'DataTransfer' AND payload LIKE '%setMeterConfiguration%' ORDER BY id DESC LIMIT 1").fetchone()
if row:
    print('ID:', row['id'])
    print('FULL PAYLOAD:\n', row['payload'])
else:
    print('None found')
" """)
print(out)

ssh.close()

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
import re

conn = sqlite3.connect('./data/ocpp16.db')
conn.row_factory = sqlite3.Row
c = conn.cursor()

print('=== CHECKING ALL MESSAGES CONTAINING HEX/KEY DATA FOR PT8 ===')
for r in c.execute('SELECT * FROM ocpp_messages_log WHERE charger_id = 4'):
    p = str(r['payload'])
    if 'key' in p.lower() or 'cert' in p.lower() or 'lem' in p.lower() or '04' in p:
        print(r['id'], '|', r['action'], '|', p[:200])
" """)
print(out)

ssh.close()

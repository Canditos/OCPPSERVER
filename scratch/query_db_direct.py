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

# Read setMeterConfiguration payload from sqlite directly
out, err = run_sudo("""python3 -c "
import sqlite3
import json

conn = sqlite3.connect('/var/lib/docker/volumes/d8j36rc0d2vizu18z7kqwf2f_ocpp-data/_data/ocpp16.db')
conn.row_factory = sqlite3.Row
c = conn.cursor()

for r in c.execute('SELECT id, action, payload FROM ocpp_messages_log WHERE payload LIKE \\\"%setMeterConfiguration%\\\" ORDER BY id DESC LIMIT 5'):
    print('ID:', r['id'], '| ACTION:', r['action'])
    print('PAYLOAD:', r['payload'])
" """)
print(out)
print(err)

ssh.close()

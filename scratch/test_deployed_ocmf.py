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

out, err = run_sudo("docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.CreatedAt}}'")
print("--- ALL DOCKER CONTAINERS ---")
print(out)

backend_name = None
for line in out.splitlines():
    if "backend" in line:
        backend_name = line.split()[0]
        break

print("Detected Backend Container:", backend_name)

if backend_name:
    cmd = f"""docker exec {backend_name} python -c "
import urllib.request
import json
import sqlite3

# Test internal API endpoint
req = urllib.request.Request('http://127.0.0.1:8000/api/ocmf/reverify-transactions', data=b'', method='POST')
try:
    with urllib.request.urlopen(req) as response:
        print('API Response:', response.read().decode('utf-8'))
except Exception as e:
    print('API Call Error:', e)

# Check DB transactions state
conn = sqlite3.connect('./data/ocpp16.db')
conn.row_factory = sqlite3.Row
c = conn.cursor()
rows = c.execute('SELECT transaction_id, charge_point_id, connector_id, ocmf_verified, ocmf_verification_error, ocmf_meter_serial FROM transactions WHERE ocmf_stop_raw IS NOT NULL').fetchall()
print('\\n=== TRANSACTIONS OCMF STATUS ===')
for r in rows:
    print('Tx #' + str(r['transaction_id']) + ' | CP: ' + str(r['charge_point_id']) + ' | Tomada ' + str(r['connector_id']) + ' | Verificado: ' + str(bool(r['ocmf_verified'])) + ' | Serial: ' + str(r['ocmf_meter_serial']) + ' | Erro: ' + str(r['ocmf_verification_error']))
" """
    out2, err2 = run_sudo(cmd)
    print(out2)

ssh.close()

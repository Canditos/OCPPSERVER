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

out, err = run_sudo("""docker exec backend-d8j36rc0d2vizu18z7kqwf2f-150852405177 python -c "
import urllib.request
import json
import sqlite3

# Test internal API endpoint: extract meter key for chargerPT8 connector 1 & 2
for cid in [1, 2]:
    req = urllib.request.Request(f'http://127.0.0.1:8000/ocmf/chargers/chargerPT8/extract-key/{cid}', data=b'', method='POST')
    try:
        with urllib.request.urlopen(req) as resp:
            print(f'Extract Key Tomada {cid} Response:', resp.read().decode('utf-8'))
    except Exception as e:
        print(f'Extract Key Tomada {cid} Error:', e)

# Test internal API endpoint: extract meter key for chargerPT21 connector 1 & 2
for cid in [1, 2]:
    req = urllib.request.Request(f'http://127.0.0.1:8000/ocmf/chargers/chargerPT21/extract-key/{cid}', data=b'', method='POST')
    try:
        with urllib.request.urlopen(req) as resp:
            print(f'Extract Key PT21 Tomada {cid} Response:', resp.read().decode('utf-8'))
    except Exception as e:
        print(f'Extract Key PT21 Tomada {cid} Error:', e)

# Reverify all transactions
req2 = urllib.request.Request('http://127.0.0.1:8000/ocmf/reverify-transactions', data=b'', method='POST')
try:
    with urllib.request.urlopen(req2) as resp2:
        print('\nRe-verify Response:', resp2.read().decode('utf-8'))
except Exception as e:
    print('Re-verify Error:', e)

conn = sqlite3.connect('./data/ocpp16.db')
conn.row_factory = sqlite3.Row
c = conn.cursor()
rows = c.execute('SELECT transaction_id, charge_point_id, connector_id, ocmf_verified, ocmf_verification_error, ocmf_meter_serial, meter_start, meter_stop FROM transactions WHERE charge_point_id = \\\"chargerPT8\\\"').fetchall()
print('\n=== chargerPT8 TRANSACTIONS METROLOGY AUDIT ===')
for r in rows:
    start_kwh = (r['meter_start'] or 0)/1000.0
    stop_kwh = (r['meter_stop'] or 0)/1000.0
    print('Tx #' + str(r['transaction_id']) + ' | Tomada ' + str(r['connector_id']) + ' | ' + str(round(start_kwh, 3)) + ' -> ' + str(round(stop_kwh, 3)) + ' kWh | Verificado: ' + str(bool(r['ocmf_verified'])) + ' | Medidor: ' + str(r['ocmf_meter_serial']) + ' | Info: ' + str(r['ocmf_verification_error']))
" """)
print(out)

ssh.close()

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
from services.ocmf_service import verify_ocmf_signature
import sqlite3

conn = sqlite3.connect('./data/ocpp16.db')
conn.row_factory = sqlite3.Row
c = conn.cursor()

row = c.execute('SELECT * FROM transactions WHERE transaction_id = 998426').fetchone()
raw_ocmf = row['ocmf_stop_raw']

der_key = '3059301306072A8648CE3D020106082A8648CE3D0301070342000408680D9D16818CBDA91E06FEF6AF6919A8241A4EA293FDDC407B1A708EB1EEB46AD5BDB2698AC47BBFECCEA6E4149A0C34EA7083989C04E8EB563AD4A40859A8'

# Test verification
res = verify_ocmf_signature(raw_ocmf, der_key)
print('VERIFICATION RESULT:')
print('Verified:', res.get('verified'))
print('Meter Serial:', res.get('meter_serial'))
print('Error:', res.get('error'))
print('Readings:', res.get('readings'))
" """)
print(out)
print(err)

ssh.close()

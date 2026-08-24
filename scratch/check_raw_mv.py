import paramiko
import json

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

stdin, stdout, stderr = ssh.exec_command('curl -s -k "https://ocpp.gatoescondido.com/api/chargers/JAAN462076/messages?limit=5"')
out = stdout.read().decode('utf-8')
try:
    msgs = json.loads(out)
    for m in msgs:
        if m.get('action') == 'MeterValues':
            print("=== RAW OCPP METERVALUES FROM JAAN462076 ===")
            print(json.dumps(json.loads(m.get('payload')), indent=2))
except Exception as e:
    print("Error:", e, out)

ssh.close()

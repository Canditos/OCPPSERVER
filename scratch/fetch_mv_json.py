import paramiko
import json

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

stdin, stdout, stderr = ssh.exec_command('curl -s -k "https://ocpp.gatoescondido.com/api/chargers/JAAN462076/messages?limit=50"')
msgs = json.loads(stdout.read().decode('utf-8'))
mv = [m for m in msgs if m.get('action') == 'MeterValues']
print("FOUND MVs:", len(mv))
if mv:
    print(json.dumps(json.loads(mv[0]['payload']), indent=2))

ssh.close()

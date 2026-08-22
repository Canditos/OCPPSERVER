import paramiko
import json

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

stdin, stdout, stderr = ssh.exec_command('curl -s -k "https://ocpp.gatoescondido.com/api/transactions/charger/JAAN462076/meter-values/live"')
out = stdout.read().decode('utf-8')
try:
    data = json.loads(out)
    print("=== LIVE METER VALUES (JAAN462076) ===")
    for item in data[-10:]:
        print(f"Time: {item.get('timestamp')} | Measurand: {item.get('measurand')} | Phase: {item.get('phase')} | Unit: {item.get('unit')} | Value: {item.get('value')}")
except Exception as e:
    print(out)

stdin, stdout, stderr = ssh.exec_command('curl -s -k "https://ocpp.gatoescondido.com/api/transactions/charger/chargerPT21/meter-values/live"')
out = stdout.read().decode('utf-8')
try:
    data = json.loads(out)
    print("\n=== LIVE METER VALUES (chargerPT21) ===")
    for item in data[-10:]:
        print(f"Time: {item.get('timestamp')} | Measurand: {item.get('measurand')} | Phase: {item.get('phase')} | Unit: {item.get('unit')} | Value: {item.get('value')}")
except Exception as e:
    print(out)

ssh.close()

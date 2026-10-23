import paramiko
import json

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

stdin, stdout, stderr = ssh.exec_command("echo canditos | sudo -S docker ps --filter name=backend-d8j36rc0d2vizu18z7kqwf2f --format '{{.Names}}'")
stdin.write("canditos\n")
stdin.flush()
backend_container = stdout.read().decode('utf-8', errors='ignore').split('\n')[-2].strip()

cmd = f"sudo -S docker exec {backend_container} python3 -c \"import urllib.request, json; print(urllib.request.urlopen('http://localhost:8000/chargers').read().decode())\""
stdin, stdout, stderr = ssh.exec_command(cmd)
stdin.write("canditos\n")
stdin.flush()

data = stdout.read().decode('utf-8', errors='ignore')
lines = [l for l in data.split('\n') if not l.startswith('[sudo')]
raw = '\n'.join(lines).strip()
chargers = json.loads(raw)

print(f"Total chargers: {len(chargers)}")
for c in chargers:
    print(f"\nID: {c.get('charge_point_id')} | Online: {c.get('is_online')} | Status: {c.get('status')}")
    for conn in c.get('connectors', []):
        print(f"  Connector #{conn.get('connector_id')}: status={conn.get('status')}, error_code={conn.get('error_code')}")

ssh.close()

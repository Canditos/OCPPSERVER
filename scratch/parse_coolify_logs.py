import paramiko
import json

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

cmd = (
    "curl -s 'http://localhost:8000/api/v1/deployments/mxiuf6kt08jxr1ziqo03s6nz' "
    "-H 'Authorization: Bearer 2|kVLCGXjjf9I9XYFpfU6Z9PwxtVVB6bybzcR4U0iyade12366'"
)

stdin, stdout, stderr = ssh.exec_command(cmd)
raw = stdout.read().decode('utf-8')
data = json.loads(raw)
logs = json.loads(data.get("logs", "[]"))
for entry in logs:
    if not entry.get("hidden"):
        print(f"[{entry.get('type')}] {entry.get('output')}")

ssh.close()

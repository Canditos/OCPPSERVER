import paramiko
import json

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

stdin, stdout, stderr = ssh.exec_command(
    "echo canditos | sudo -S docker exec coolify-db psql -U coolify -d coolify -t -c "
    "\"SELECT logs FROM application_deployment_queues WHERE deployment_uuid = 'iuwswp78g5q14ndxv1ja7dmm';\""
)
raw = stdout.read().decode('utf-8', errors='replace').strip()

try:
    logs = json.loads(raw)
    # Find vite build output
    for entry in logs:
        output = entry.get('output', '')
        if 'error' in output.lower() or 'vite' in output.lower() or 'TS' in output or 'failed' in output.lower() or 'Cannot find' in output or 'not assignable' in output or 'Module' in output:
            safe = output.encode('ascii', errors='replace').decode('ascii')
            print(safe)
except:
    # Fallback: search for error-related lines
    for line in raw.split('\\n'):
        lowered = line.lower()
        if any(kw in lowered for kw in ['error', 'ts(', 'cannot', 'failed', 'module', 'not found', 'missing']):
            safe = line.encode('ascii', errors='replace').decode('ascii')
            print(safe)

ssh.close()

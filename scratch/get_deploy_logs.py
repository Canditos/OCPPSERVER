import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

# Get deploy logs for the latest failed deployment
stdin, stdout, stderr = ssh.exec_command(
    "echo canditos | sudo -S docker exec coolify-db psql -U coolify -d coolify -c "
    "\"SELECT logs FROM application_deployment_queues WHERE deployment_uuid = 'iuwswp78g5q14ndxv1ja7dmm';\""
)
out = stdout.read().decode('utf-8', errors='replace').strip()
print("=== DEPLOY LOGS (iuwswp78g5q14ndxv1ja7dmm) ===")
# Truncate to last 3000 chars for readability
safe = out.encode('ascii', errors='replace').decode('ascii')
if len(safe) > 3000:
    print("... (truncated) ...")
    print(safe[-3000:])
else:
    print(safe)

ssh.close()

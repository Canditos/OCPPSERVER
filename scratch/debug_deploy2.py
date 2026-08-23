import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

# Check Coolify deploy logs in storage
cmds = [
    "find /data/coolify/logs -name '*.log' -mmin -10 2>/dev/null | head -5",
    "ls -la /data/coolify/applications/d8j36rc0d2vizu18z7kqwf2f/ 2>/dev/null",
    "find /data/coolify/ -name '*.log' -mmin -10 2>/dev/null | head -10",
]

for cmd in cmds:
    full_cmd = f"echo canditos | sudo -S {cmd}"
    stdin, stdout, stderr = ssh.exec_command(full_cmd)
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    print(f"CMD: {cmd}")
    print(f"OUT: {out}")
    if err and 'Password' not in err:
        print(f"ERR: {err}")
    print("---")

# Check Coolify DB for deployment logs
stdin, stdout, stderr = ssh.exec_command(
    "echo canditos | sudo -S docker exec coolify-db psql -U coolify -d coolify -c "
    "\"SELECT id, deployment_uuid, status, created_at FROM application_deployment_queues ORDER BY id DESC LIMIT 5;\""
)
out = stdout.read().decode('utf-8', errors='replace').strip()
print("=== DEPLOYMENT QUEUE ===")
print(out.encode('ascii', errors='replace').decode('ascii'))

ssh.close()

import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

# Check if there are any docker build helper containers (even exited)
stdin, stdout, stderr = ssh.exec_command("echo canditos | sudo -S docker ps -a --filter name=d8j36rc0d2vizu18z7kqwf2f --format '{{.Names}} | {{.Status}} | {{.Image}}' 2>&1")
out = stdout.read().decode('utf-8', errors='replace').strip()
print("=== ALL CONTAINERS FOR APP ===")
print(out)

# Check recent Coolify worker logs for ApplicationDeploymentJob
stdin2, stdout2, stderr2 = ssh.exec_command("echo canditos | sudo -S docker logs --tail 60 coolify 2>&1 | grep -i -E 'deploy|error|fail|a48e583'")
raw = stdout2.read().decode('utf-8', errors='replace')
print("\n=== COOLIFY DEPLOY LOGS ===")
print(raw.encode('ascii', errors='replace').decode('ascii'))

# Check queue worker logs
stdin3, stdout3, stderr3 = ssh.exec_command("echo canditos | sudo -S docker exec coolify cat /var/log/coolify-worker.log 2>&1 | tail -30")
raw3 = stdout3.read().decode('utf-8', errors='replace')
print("\n=== WORKER LOG ===")
print(raw3.encode('ascii', errors='replace').decode('ascii'))

ssh.close()

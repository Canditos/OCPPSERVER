import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

# Check current containers
stdin, stdout, stderr = ssh.exec_command("echo canditos | sudo -S docker ps --format '{{.Names}} | {{.Status}} | {{.Image}}'")
out = stdout.read().decode('utf-8').strip()
print("=== CONTAINERS ===")
print(out)

# Check Coolify build logs
stdin2, stdout2, stderr2 = ssh.exec_command("echo canditos | sudo -S docker logs --tail 10 coolify 2>&1")
raw = stdout2.read().decode('utf-8', errors='replace')
print("\n=== COOLIFY LAST 10 LINES ===")
print(raw.encode('ascii', errors='replace').decode('ascii'))

ssh.close()

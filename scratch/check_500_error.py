import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

stdin, stdout, stderr = ssh.exec_command("echo canditos | sudo -S docker ps --format '{{.Names}}' | grep backend")
cname = stdout.read().decode('utf-8').strip()
print("Backend container name:", cname)
if cname:
    stdin, stdout, stderr = ssh.exec_command(f"echo canditos | sudo -S docker logs --tail 60 {cname}")
    print("=== LOGS ===")
    print(stdout.read().decode('utf-8'))
    print("=== ERR ===")
    print(stderr.read().decode('utf-8'))

ssh.close()

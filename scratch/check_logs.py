import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

stdin, stdout, stderr = ssh.exec_command("echo canditos | sudo -S docker ps --filter name=backend --format '{{.ID}}'")
cid = stdout.read().decode('utf-8').strip().split('\n')[0]

stdin, stdout, stderr = ssh.exec_command(f"echo canditos | sudo -S docker logs --tail 100 {cid}")
print(stdout.read().decode('utf-8'))
ssh.close()

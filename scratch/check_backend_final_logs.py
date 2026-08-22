import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

stdin, stdout, stderr = ssh.exec_command("echo canditos | sudo -S docker logs --tail 25 backend-d8j36rc0d2vizu18z7kqwf2f-223504711814")
print("=== BACKEND LOGS ===")
print(stdout.read().decode('utf-8'))

ssh.close()

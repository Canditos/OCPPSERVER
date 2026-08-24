import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

stdin, stdout, stderr = ssh.exec_command("echo canditos | sudo -S docker logs --tail 40 sglqhaw1m3w3dopbcpkktvit")
print("=== BUILD LOGS ===")
print(stdout.read().decode('utf-8'))

ssh.close()

import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

cmd = "echo canditos | sudo -S docker exec frontend-d8j36rc0d2vizu18z7kqwf2f-222558886066 wget -qO- http://localhost/api/smart-charging/presets"
stdin, stdout, stderr = ssh.exec_command(cmd)
print("=== NGINX REVERSE PROXY TO BACKEND ===")
print(stdout.read().decode('utf-8')[:300])
print(stderr.read().decode('utf-8'))

ssh.close()

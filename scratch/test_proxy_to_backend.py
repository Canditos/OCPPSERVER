import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

cmd = "echo canditos | sudo -S docker exec coolify-proxy wget -qO- http://10.0.2.3:8000/smart-charging/presets"
stdin, stdout, stderr = ssh.exec_command(cmd)
print("=== FROM PROXY TO BACKEND ===")
print(stdout.read().decode('utf-8')[:300])

ssh.close()

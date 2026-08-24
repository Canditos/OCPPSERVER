import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

cmd = "echo canditos | sudo -S docker exec frontend-d8j36rc0d2vizu18z7kqwf2f-222558886066 wget -qO- http://localhost:80/"
stdin, stdout, stderr = ssh.exec_command(cmd)
print("=== FROM FRONTEND NGINX ===")
print(stdout.read().decode('utf-8')[:300])

cmd2 = "echo canditos | sudo -S docker exec frontend-d8j36rc0d2vizu18z7kqwf2f-222558886066 cat /etc/nginx/conf.d/default.conf"
stdin2, stdout2, stderr2 = ssh.exec_command(cmd2)
print("=== NGINX CONF ===")
print(stdout2.read().decode('utf-8'))

ssh.close()

import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

cmd = "echo canditos | sudo -S docker exec frontend-d8j36rc0d2vizu18z7kqwf2f-222558886066 wget -qO- http://10.0.2.3:8000/smart-charging/presets"
stdin, stdout, stderr = ssh.exec_command(cmd)
print("=== VIA 10.0.2.3 ===")
print(stdout.read().decode('utf-8')[:300])

cmd2 = "echo canditos | sudo -S docker exec frontend-d8j36rc0d2vizu18z7kqwf2f-222558886066 wget -qO- http://10.0.1.10:8000/smart-charging/presets"
stdin2, stdout2, stderr2 = ssh.exec_command(cmd2)
print("=== VIA 10.0.1.10 ===")
print(stdout2.read().decode('utf-8')[:300])

ssh.close()

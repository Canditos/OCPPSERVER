import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

cmd = "echo canditos | sudo -S docker inspect frontend-d8j36rc0d2vizu18z7kqwf2f-222558886066 --format '{{json .NetworkSettings.Networks}}'"
stdin, stdout, stderr = ssh.exec_command(cmd)
print("=== FRONTEND NETWORKS ===")
print(stdout.read().decode('utf-8'))

cmd2 = "echo canditos | sudo -S docker inspect backend-d8j36rc0d2vizu18z7kqwf2f-222558881523 --format '{{json .NetworkSettings.Networks}}'"
stdin2, stdout2, stderr2 = ssh.exec_command(cmd2)
print("=== BACKEND NETWORKS ===")
print(stdout2.read().decode('utf-8'))

ssh.close()

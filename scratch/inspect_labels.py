import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

stdin, stdout, stderr = ssh.exec_command("echo canditos | sudo -S docker inspect frontend-d8j36rc0d2vizu18z7kqwf2f-222558886066 --format '{{json .Config.Labels}}'")
print("=== FRONTEND LABELS ===")
print(stdout.read().decode('utf-8'))

stdin, stdout, stderr = ssh.exec_command("echo canditos | sudo -S docker inspect backend-d8j36rc0d2vizu18z7kqwf2f-222558881523 --format '{{json .Config.Labels}}'")
print("=== BACKEND LABELS ===")
print(stdout.read().decode('utf-8'))

ssh.close()

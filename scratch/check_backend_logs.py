import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

stdin, stdout, stderr = ssh.exec_command("echo canditos | sudo -S docker logs e91f8839a3fd")
print("=== LOGS STDOUT ===")
print(stdout.read().decode('utf-8'))
print("=== LOGS STDERR ===")
print(stderr.read().decode('utf-8'))

ssh.close()

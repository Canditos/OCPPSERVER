import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

print("=== PORT 8090 LOCAL RESPONSE ===")
stdin, stdout, stderr = ssh.exec_command("curl -i http://localhost:8090/")
print(stdout.read().decode('utf-8'))

ssh.close()

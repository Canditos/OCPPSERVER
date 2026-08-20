import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

stdin, stdout, stderr = ssh.exec_command("curl -i http://localhost:80/ -H 'Host: ocpp.gatoescondido.com'")
print("=== PORT 80 RESPONSE ===")
print(stdout.read().decode('utf-8'))

ssh.close()

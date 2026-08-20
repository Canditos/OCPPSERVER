import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

print("=== TESTING HTTP PORT 80 VIA TRAEFIK ===")
stdin, stdout, stderr = ssh.exec_command("curl -i http://localhost:80/ -H 'Host: ocpp.gatoescondido.com'")
print(stdout.read().decode('utf-8'))

print("=== TESTING DIRECT FRONTEND CONTAINER ===")
stdin, stdout, stderr = ssh.exec_command("echo canditos | sudo -S docker exec frontend-d8j36rc0d2vizu18z7kqwf2f-233016858449 curl -i http://localhost:80/")
print(stdout.read().decode('utf-8'))

ssh.close()

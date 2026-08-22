import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

stdin, stdout, stderr = ssh.exec_command("curl -s -k https://ocpp.gatoescondido.com/health")
print("=== HTTPS HEALTH ===")
print(stdout.read().decode('utf-8'))

stdin, stdout, stderr = ssh.exec_command("curl -s -k https://ocpp.gatoescondido.com/api/smart-charging/presets")
print("=== HTTPS SMART CHARGING PRESETS ===")
print(stdout.read().decode('utf-8')[:400])

ssh.close()

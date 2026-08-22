import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

stdin, stdout, stderr = ssh.exec_command("curl -s -k https://ocpp.gatoescondido.com/api/smart-charging/presets")
print("=== SMART CHARGING PRESETS ===")
print(stdout.read().decode('utf-8')[:500])

ssh.close()

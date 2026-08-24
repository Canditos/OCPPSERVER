import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

stdin, stdout, stderr = ssh.exec_command("curl -s -k -H 'Host: ocpp.gatoescondido.com' https://localhost:443/smart-charging/presets")
print("=== PORT 443 PRESETS ===")
print(stdout.read().decode('utf-8')[:300])

ssh.close()

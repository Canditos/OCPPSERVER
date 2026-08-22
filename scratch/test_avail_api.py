import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

stdin, stdout, stderr = ssh.exec_command("curl -s -k https://ocpp.gatoescondido.com/api/chargers/JAAN462076/availability")
print("=== JAAN462076 AVAILABILITY VIA DOMAIN ===")
print(stdout.read().decode('utf-8'))

ssh.close()

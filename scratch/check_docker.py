import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

stdin, stdout, stderr = ssh.exec_command("echo canditos | sudo -S docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'")
print("DOCKER PS:\n", stdout.read().decode('utf-8'))

stdin, stdout, stderr = ssh.exec_command("echo canditos | sudo -S docker ps -a | grep -i helper | head -n 5")
print("HELPERS:\n", stdout.read().decode('utf-8'))

ssh.close()

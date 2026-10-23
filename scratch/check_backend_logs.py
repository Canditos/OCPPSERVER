import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

stdin, stdout, stderr = ssh.exec_command("""
ID=$(echo canditos | sudo -S docker ps -a --filter "name=backend-d8j36rc0d2vizu18z7kqwf2f" --format "{{.ID}}" | head -n 1)
echo "Container ID: $ID"
echo canditos | sudo -S docker logs --tail 40 $ID
""")
print(stdout.read().decode('utf-8', errors='ignore'))
print(stderr.read().decode('utf-8', errors='ignore'))

ssh.close()

import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

stdin, stdout, stderr = ssh.exec_command(
    "echo canditos | sudo -S docker logs --tail 100 backend-d8j36rc0d2vizu18z7kqwf2f-233824743344"
)
out = stdout.read().decode('utf-8', errors='replace')
print("=== BACKEND LOGS ===")
print(out)

ssh.close()

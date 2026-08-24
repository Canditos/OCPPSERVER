import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

cmd = "echo canditos | sudo -S docker exec backend-d8j36rc0d2vizu18z7kqwf2f-222558881523 python -c \"import urllib.request; print(urllib.request.urlopen('http://localhost:8000/api/smart-charging/presets').read().decode()[:400])\""
stdin, stdout, stderr = ssh.exec_command(cmd)
print("=== STDOUT ===")
print(stdout.read().decode('utf-8'))
print("=== STDERR ===")
print(stderr.read().decode('utf-8'))

ssh.close()

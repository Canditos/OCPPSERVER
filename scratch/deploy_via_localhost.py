import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

cmd = (
    "curl -i -X POST 'http://localhost:8000/api/v1/deploy?uuid=d8j36rc0d2vizu18z7kqwf2f&force=true' "
    "-H 'Authorization: Bearer 2|kVLCGXjjf9I9XYFpfU6Z9PwxtVVB6bybzcR4U0iyade12366' "
    "-H 'Content-Type: application/json'"
)

stdin, stdout, stderr = ssh.exec_command(cmd)
print("=== DEPLOY RESPONSE VIA LOCALHOST ===")
print(stdout.read().decode('utf-8'))

ssh.close()

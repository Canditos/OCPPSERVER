import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

cmd = (
    "curl -s 'http://localhost:8000/api/v1/deployments/mxiuf6kt08jxr1ziqo03s6nz' "
    "-H 'Authorization: Bearer 2|kVLCGXjjf9I9XYFpfU6Z9PwxtVVB6bybzcR4U0iyade12366'"
)

stdin, stdout, stderr = ssh.exec_command(cmd)
print("=== DEPLOYMENT LOGS ===")
print(stdout.read().decode('utf-8')[-2000:])

ssh.close()

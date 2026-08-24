import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

stdin, stdout, stderr = ssh.exec_command("echo canditos | sudo -S docker ps --format '{{.Names}}'")
containers = stdout.read().decode('utf-8').strip().split('\n')
backend_c = [c for c in containers if 'backend' in c]
print("Found backend containers:", backend_c)
if backend_c:
    stdin, stdout, stderr = ssh.exec_command(f"echo canditos | sudo -S docker logs --tail 40 {backend_c[0]}")
    print("=== LOGS ===")
    print(stdout.read().decode('utf-8'))
    print("=== ERR ===")
    print(stderr.read().decode('utf-8'))

ssh.close()

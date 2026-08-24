import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

stdin, stdout, stderr = ssh.exec_command("echo canditos | sudo -S docker exec coolify-proxy cat /traefik.yaml /etc/traefik/traefik.yaml /traefik/dynamic/coolify.yaml 2>/dev/null")
print("=== TRAEFIK CONFIG ===")
print(stdout.read().decode('utf-8'))

ssh.close()

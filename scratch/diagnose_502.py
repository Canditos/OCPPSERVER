import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

def run_cmd(cmd):
    stdin, stdout, stderr = ssh.exec_command(f"echo canditos | sudo -S {cmd}")
    return stdout.read().decode('utf-8', errors='ignore') + stderr.read().decode('utf-8', errors='ignore')

print("=== CLOUDFLARED LOGS ===")
print(run_cmd("journalctl -u cloudflared -n 30 --no-pager"))

print("=== COOLIFY PROXY LOGS ===")
print(run_cmd("docker logs coolify-proxy --tail 30"))

ssh.close()

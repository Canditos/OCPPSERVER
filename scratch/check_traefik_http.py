import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

def run_cmd(cmd):
    stdin, stdout, stderr = ssh.exec_command(f"echo canditos | sudo -S {cmd}")
    return stdout.read().decode('utf-8', errors='ignore')

print("=== TRAEFIK LOGS FOR HTTP FQDN ===")
print(run_cmd("docker logs coolify-proxy --tail 25"))

print("=== FRONTEND LABELS ===")
print(run_cmd("docker inspect frontend-d8j36rc0d2vizu18z7kqwf2f-235414850788 --format '{{json .Config.Labels}}'"))

ssh.close()

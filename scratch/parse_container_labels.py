import paramiko
import json

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

def run_cmd(cmd):
    stdin, stdout, stderr = ssh.exec_command(f"echo canditos | sudo -S {cmd}")
    return stdout.read().decode('utf-8', errors='ignore')

container_name = run_cmd("docker ps --filter name=frontend-d8j --format {{.Names}}").strip().splitlines()[0]
print("CONTAINER NAME:", container_name)

out = run_cmd(f"docker inspect {container_name}")
data = json.loads(out)
labels = data[0]['Config']['Labels']
for k, v in labels.items():
    if 'traefik' in k or 'caddy' in k:
        print(f"{k} = {v}")

ssh.close()

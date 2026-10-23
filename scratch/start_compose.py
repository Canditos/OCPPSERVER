import sys
import paramiko
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

def run_sudo(cmd):
    stdin, stdout, stderr = ssh.exec_command(f"sudo -S {cmd}")
    stdin.write("canditos\n")
    stdin.flush()
    return stdout.read().decode('utf-8', errors='ignore'), stderr.read().decode('utf-8', errors='ignore')

out, err = run_sudo("cat /data/coolify/applications/d8j36rc0d2vizu18z7kqwf2f/docker-compose.yaml")
print(out)

out2, err2 = run_sudo("cd /data/coolify/applications/d8j36rc0d2vizu18z7kqwf2f/ && docker compose --env-file .env up -d")
print("Compose output:\n", out2)
print("Compose stderr:\n", err2)

ssh.close()

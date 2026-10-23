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

run_sudo("docker network create d8j36rc0d2vizu18z7kqwf2f || true")
out, err = run_sudo("docker compose -f /data/coolify/applications/d8j36rc0d2vizu18z7kqwf2f/docker-compose.yaml up -d")
print("Compose output:\n", out)
print("Compose stderr:\n", err)

out2, err2 = run_sudo("docker ps --format 'table {{.Names}}\t{{.Status}}'")
print("--- RUNNING CONTAINERS ---")
print(out2)

ssh.close()

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

out, err = run_sudo("find /data/coolify/applications/d8j36rc0d2vizu18z7kqwf2f/ -name docker-compose.yml -o -name docker-compose.yaml")
print("Compose Path:", out)

out2, err2 = run_sudo("cd /data/coolify/applications/d8j36rc0d2vizu18z7kqwf2f/ && docker compose ps -a")
print("Compose PS:\n", out2)

out3, err3 = run_sudo("cd /data/coolify/applications/d8j36rc0d2vizu18z7kqwf2f/ && docker compose up -d")
print("Compose Up:\n", out3)

ssh.close()

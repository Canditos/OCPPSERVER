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

out, err = run_sudo("docker ps -a --filter 'name=backend-d8j36rc0d2vizu18z7kqwf2f' --format 'table {{.Names}}\t{{.Status}}'")
print(out)

out2, err2 = run_sudo("docker logs --tail 30 backend-d8j36rc0d2vizu18z7kqwf2f-143855255580")
print("--- BACKEND LOGS ---")
print(out2)
print(err2)

ssh.close()

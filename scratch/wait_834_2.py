import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

for i in range(12):
    time.sleep(4)
    stdin, stdout, stderr = ssh.exec_command("echo canditos | sudo -S docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}' | grep 834691e")
    out = stdout.read().decode('utf-8').strip()
    if "834691e" in out and "Up" in out:
        print("=== DEPLOY SUCCESS: Commit 834691e is UP and RUNNING! ===")
        print(out)
        break
    else:
        print(f"Waiting {i+1}...")

ssh.close()

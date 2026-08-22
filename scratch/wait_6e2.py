import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

for i in range(16):
    time.sleep(4)
    stdin, stdout, stderr = ssh.exec_command("echo canditos | sudo -S docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}' | grep 6e28e99")
    out = stdout.read().decode('utf-8').strip()
    if "6e28e99" in out and "Up" in out:
        print("=== DEPLOY SUCCESS: Commit 6e28e99 is UP and RUNNING! ===")
        print(out)
        break
    else:
        print(f"Waiting {i+1}...")

ssh.close()

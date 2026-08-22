import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

for i in range(12):
    time.sleep(5)
    stdin, stdout, stderr = ssh.exec_command("echo canditos | sudo -S docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}' | head -n 4")
    out = stdout.read().decode('utf-8')
    print(f"=== Check {i+1} ===")
    print(out)
    if "2a7fd25" in out and "Up" in out:
        print("Commit 2a7fd25 is now UP and RUNNING!")
        break

ssh.close()

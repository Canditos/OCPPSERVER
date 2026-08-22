import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

for i in range(8):
    time.sleep(5)
    stdin, stdout, stderr = ssh.exec_command("echo canditos | sudo -S docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}' | head -n 6")
    out = stdout.read().decode('utf-8')
    print(f"=== Check {i+1} ===")
    print(out)
    if "cd304c2" in out and "Up" in out:
        print("Latest commit deployed and running successfully!")
        break

ssh.close()

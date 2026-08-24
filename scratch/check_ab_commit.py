import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

for i in range(12):
    time.sleep(5)
    stdin, stdout, stderr = ssh.exec_command("echo canditos | sudo -S docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}' | grep ab82f99")
    out = stdout.read().decode('utf-8').strip()
    print(f"=== Check {i+1} ===")
    print(out)
    if "ab82f99" in out and "Up" in out:
        print("Commit ab82f99 is fully deployed and active!")
        break

ssh.close()

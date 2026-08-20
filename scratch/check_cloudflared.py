import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

def run_cmd(cmd):
    stdin, stdout, stderr = ssh.exec_command(f"echo canditos | sudo -S {cmd}")
    return (stdout.read().decode('utf-8', errors='ignore') + stderr.read().decode('utf-8', errors='ignore'))

print("=== CLOUDFLARED STATUS ===")
print(run_cmd("systemctl status cloudflared --no-pager").encode('ascii', errors='ignore').decode('ascii'))

print("=== CLOUDFLARED CONFIG ===")
print(run_cmd("cat /etc/cloudflared/config.yml").encode('ascii', errors='ignore').decode('ascii'))

ssh.close()

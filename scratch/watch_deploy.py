import sys
import time
import paramiko
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

print("Watching deployment progress...")
for i in range(15):
    stdin, stdout, stderr = ssh.exec_command("""
    echo canditos | sudo -S docker exec coolify php /var/www/html/artisan tinker --execute="
    \$dep = App\Models\ApplicationDeploymentQueue::where('deployment_uuid', '3e284fc1-2bfe-49de-acb8-8df6c63edd32')->first();
    if (\$dep) {
        echo 'Status: ' . \$dep->status . ' | Current Step: ' . (\$dep->current_process_id ?? 'building') . PHP_EOL;
    }
    " 2>/dev/null || true
    """)
    res = stdout.read().decode('utf-8', errors='ignore').strip()
    print(f"[{i*4}s] {res}")
    if "finished" in res.lower() or "success" in res.lower() or "failed" in res.lower() or "error" in res.lower():
        break
    time.sleep(4)

print("\n--- Running Containers ---")
stdin, stdout, stderr = ssh.exec_command("echo canditos | sudo -S docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'")
print(stdout.read().decode('utf-8', errors='ignore'))

ssh.close()

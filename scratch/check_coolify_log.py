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

out, err = run_sudo("""docker exec coolify php /var/www/html/artisan tinker --execute="
\$dep = App\Models\ApplicationDeploymentQueue::orderBy('id', 'desc')->first();
echo 'Latest Deployment ID: ' . \$dep->id . ' | Status: ' . \$dep->status . PHP_EOL;
echo 'Logs: ' . PHP_EOL . substr(\$dep->logs, -2000);
" """)
print(out)

ssh.close()

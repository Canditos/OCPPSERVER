import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

stdin, stdout, stderr = ssh.exec_command("echo canditos | sudo -S docker ps --format 'table {{.Names}}\t{{.Status}}'")
print("--- RUNNING CONTAINERS ---")
print(stdout.read().decode('utf-8', errors='ignore'))

# Check latest deployments in Coolify DB
stdin, stdout, stderr = ssh.exec_command("""
echo canditos | sudo -S docker exec coolify php /var/www/html/artisan tinker --execute="
\$deps = App\Models\ApplicationDeploymentQueue::orderBy('id', 'desc')->take(3)->get(['id', 'status', 'created_at', 'updated_at']);
foreach (\$deps as \$d) {
    echo 'ID: ' . \$d->id . ' | Status: ' . \$d->status . ' | Updated: ' . \$d->updated_at . PHP_EOL;
}
" 2>/dev/null || true
""")
print("--- COOLIFY DEPLOYMENT QUEUE ---")
print(stdout.read().decode('utf-8', errors='ignore'))

ssh.close()

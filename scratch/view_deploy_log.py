import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

cmd = """echo canditos | sudo -S docker exec coolify php /var/www/html/artisan tinker --execute="
foreach (App\\Models\\ApplicationDeploymentQueue::whereIn('id', [304, 305])->get() as \\$d) {
    echo 'Deploy ID: ' . \\$d->id . ' Status: ' . \\$d->status . ' App: ' . \\$d->application()->first()->name . PHP_EOL;
    echo 'Commit: ' . \\$d->commit . PHP_EOL;
    if (\\$d->logs) { echo substr(\\$d->logs, -300) . PHP_EOL; }
}
"
"""

stdin, stdout, stderr = ssh.exec_command(cmd)
print(stdout.read().decode('utf-8', errors='ignore'))
ssh.close()

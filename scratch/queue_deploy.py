import sys
import paramiko
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

stdin, stdout, stderr = ssh.exec_command("""
echo canditos | sudo -S docker exec coolify php /var/www/html/artisan tinker --execute="
\$app = App\Models\Application::where('uuid', 'd8j36rc0d2vizu18z7kqwf2f')->first();
if (\$app) {
    echo 'Deploying application: ' . \$app->name . PHP_EOL;
    \$deployment_uuid = (string) Illuminate\Support\Str::uuid();
    queue_application_deployment(
        application: \$app,
        deployment_uuid: \$deployment_uuid,
        force_rebuild: true
    );
    echo 'Deployment queued successfully! UUID: ' . \$deployment_uuid . PHP_EOL;
} else {
    echo 'App not found!';
}
"
""")
print(stdout.read().decode('utf-8', errors='ignore'))
print(stderr.read().decode('utf-8', errors='ignore'))

ssh.close()

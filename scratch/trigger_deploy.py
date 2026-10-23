import sys
import requests
import json
import time
import paramiko

sys.stdout.reconfigure(encoding='utf-8', errors='replace')
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

print("Triggering Coolify deploy from inside...")
stdin, stdout, stderr = ssh.exec_command("""
echo canditos | sudo -S docker exec coolify php artisan app:deploy --resource-uuid=d8j36rc0d2vizu18z7kqwf2f 2>/dev/null || true
""")
print(stdout.read().decode('utf-8', errors='ignore'))
print(stderr.read().decode('utf-8', errors='ignore'))

# Or check git pull directly in coolify volumes
stdin, stdout, stderr = ssh.exec_command("""
echo canditos | sudo -S docker exec coolify php /var/www/html/artisan tinker --execute="echo App\Models\Application::where('uuid', 'd8j36rc0d2vizu18z7kqwf2f')->first()?->name;" 2>/dev/null || true
""")
print("App Name in Coolify:", stdout.read().decode('utf-8', errors='ignore'))

ssh.close()

import sys
import paramiko
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

script_content = '''
import urllib.request
import json

# Test GET /ocmf/meter-keys?charge_point_id=chargerPT8
req = urllib.request.Request('http://127.0.0.1:8000/ocmf/meter-keys?charge_point_id=chargerPT8')
try:
    with urllib.request.urlopen(req) as resp:
        print('GET meter-keys for chargerPT8:', resp.read().decode('utf-8'))
except Exception as e:
    print('GET meter-keys Error:', e)

# Test POST /ocmf/chargers/chargerPT8/extract-key/1
req2 = urllib.request.Request('http://127.0.0.1:8000/ocmf/chargers/chargerPT8/extract-key/1', data=b'', method='POST')
try:
    with urllib.request.urlopen(req2) as resp2:
        print('Extract key 1:', resp2.read().decode('utf-8'))
except Exception as e:
    print('Extract key 1 Error:', e)
'''

sftp = ssh.open_sftp()
with sftp.open('/tmp/test_meter_api.py', 'w') as f:
    f.write(script_content)
sftp.close()

stdin, stdout, stderr = ssh.exec_command("""
echo canditos | sudo -S docker cp /tmp/test_meter_api.py backend-d8j36rc0d2vizu18z7kqwf2f-151520327323:/app/test_meter_api.py
echo canditos | sudo -S docker exec backend-d8j36rc0d2vizu18z7kqwf2f-151520327323 python /app/test_meter_api.py
""")
print(stdout.read().decode('utf-8', errors='ignore'))
print(stderr.read().decode('utf-8', errors='ignore'))

ssh.close()

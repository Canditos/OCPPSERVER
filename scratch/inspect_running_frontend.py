import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.0.198', username='canditos', password='canditos')

def run_cmd(cmd):
    stdin, stdout, stderr = ssh.exec_command(f"echo canditos | sudo -S {cmd}")
    return stdout.read().decode('utf-8', errors='ignore')

container_name = run_cmd("docker ps --filter 'name=frontend-d8j' --format '{{.Names}}'").strip()
print("CONTAINER NAME:", repr(container_name))

if container_name:
    # get first line of container_name if multiple
    cname = container_name.splitlines()[0]
    print("=== LABELS ===")
    print(run_cmd(f'docker inspect {cname} --format "{{json .Config.Labels}}"'))

ssh.close()

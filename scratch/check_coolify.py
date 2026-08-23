import requests

url = "https://coolify.gatoescondido.com/api/v1/deployments"
headers = {
    "Authorization": "Bearer 2|kVLCGXjjf9I9XYFpfU6Z9PwxtVVB6bybzcR4U0iyade12366",
    "Accept": "application/json"
}

r = requests.get(url, headers=headers, verify=False)
print("STATUS:", r.status_code)
deployments = r.json()
for d in deployments[:5]:
    print(d.get('id'), d.get('status'), d.get('created_at'), d.get('deployment_uuid'))

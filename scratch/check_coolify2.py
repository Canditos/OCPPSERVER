import requests

url = "https://coolify.gatoescondido.com/api/v1/deployments"
headers = {
    "Authorization": "Bearer 2|kVLCGXjjf9I9XYFpfU6Z9PwxtVVB6bybzcR4U0iyade12366",
    "Accept": "application/json"
}

r = requests.get(url, headers=headers, verify=False)
data = r.json()
print("TYPE:", type(data))
print("DATA:", str(data)[:500])

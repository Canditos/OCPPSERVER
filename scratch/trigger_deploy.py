import requests

url = "https://coolify.gatoescondido.com/api/v1/deploy?uuid=d8j36rc0d2vizu18z7kqwf2f&force=true"
headers = {
    "Authorization": "Bearer 2|kVLCGXjjf9I9XYFpfU6Z9PwxtVVB6bybzcR4U0iyade12366",
    "Content-Type": "application/json"
}

r = requests.post(url, headers=headers, verify=False)
print("STATUS:", r.status_code)
print("RESPONSE:", r.text)

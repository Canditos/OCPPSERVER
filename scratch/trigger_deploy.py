import requests, urllib3
urllib3.disable_warnings()

headers = {
    "Authorization": "Bearer 8|ko5adf1TYVrRnqKPa7TyTr3YyHrNXbMWmgCpOcVMab661ec2",
    "Accept": "application/json"
}

# Deploy application d8j36rc0d2vizu18z7kqwf2f
url = "https://coolify.gatoescondido.com/api/v1/deploy"
params = {
    "uuid": "d8j36rc0d2vizu18z7kqwf2f",
    "force": "true"
}

r = requests.post(url, headers=headers, params=params, verify=False)
print("STATUS:", r.status_code)
print("RESPONSE:", r.text)

$mkBytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($mkBytes)
$mk = [System.Convert]::ToBase64String($mkBytes)
$admin = [System.Guid]::NewGuid().ToString()
Write-Output "MASTER_KEY=$mk"
Write-Output "ADMIN_API_KEY=$admin"
$env:NODE_ENV='production'
$env:MASTER_KEY=$mk
$env:ADMIN_API_KEY=$admin
# preserve APS creds from current environment if set
$env:APS_CLIENT_ID = $env:APS_CLIENT_ID
$env:APS_CLIENT_SECRET = $env:APS_CLIENT_SECRET
Start-Process -FilePath node -ArgumentList 'server.js' -WorkingDirectory 'C:\Users\HP\Desktop\FloorPlan-Pro-Clean' -PassThru | Select-Object Id, StartTime

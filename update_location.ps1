$headers = @{ "Content-Type" = "application/json" }
$body = '{
    "latitude": 12.971116,
    "longitude": 79.163819,
    "altitude": 0.0,
    "speed": 0.00,
    "satellites": 5,
    "battery": 3.95,
    "rssi": -70
}'

Write-Host "Starting location update loop (Press Ctrl+C to stop)"
Write-Host "Sending updates every 30 seconds..."

while ($true) {
    $response = Invoke-WebRequest -Uri "http://localhost:5000/api/upload" -Method POST -Headers $headers -Body $body
    $timestamp = Get-Date -Format "HH:mm:ss"
    Write-Host "[$timestamp] Location update sent - Status: $($response.StatusCode)"
    Start-Sleep -Seconds 30
}
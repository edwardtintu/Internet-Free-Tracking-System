$headers = @{ "Content-Type" = "application/json" }
$body = '{
  "latitude": 12.971139,
  "longitude": 79.163780,
  "altitude": 30.5,
  "speed": 0.00,
  "satellites": 8,
  "battery": 3.72,
  "rssi": -73
}'
$logFile = "d:\EDWARD\TARP\update_location.log"

function Log($msg) {
    $t = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "[$t] $msg"
    $line | Out-File -FilePath $logFile -Append -Encoding UTF8
    Write-Host $line
}

Log "Starting retry loop (interval: 30s). Payload will be sent to http://localhost:5000/api/upload"

while ($true) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:5000/api/upload" -Method POST -Headers $headers -Body $body -TimeoutSec 10
        if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300) {
            Log "SUCCESS: HTTP $($response.StatusCode) - $($response.Content)"
        } else {
            Log "FAILED: HTTP $($response.StatusCode) - $($response.Content)"
        }
    } catch {
        $err = $_.Exception.Message
        Log "ERROR: $err"
    }

    Start-Sleep -Seconds 30
}
param(
  [string]$ApkPath = (Join-Path $PSScriptRoot '..\public\downloads\AIAS-Basra-Community-2.5-release.apk'),
  [string]$Bucket = 'space-42d87.firebasestorage.app',
  [string]$ObjectName = 'downloads/AIAS-Basra-Community-2.5-release.apk'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http
$configPath = Join-Path $env:USERPROFILE '.config\configstore\firebase-tools.json'
$firebaseConfig = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
$accessToken = [string]$firebaseConfig.tokens.access_token
if (-not $accessToken) { throw 'Firebase CLI access token is unavailable. Run firebase login first.' }
if (-not (Test-Path -LiteralPath $ApkPath)) { throw "APK not found: $ApkPath" }

$downloadToken = [guid]::NewGuid().ToString()
$encodedBucket = [uri]::EscapeDataString($Bucket)
$encodedObject = [uri]::EscapeDataString($ObjectName)
$initUri = "https://storage.googleapis.com/upload/storage/v1/b/$encodedBucket/o?uploadType=resumable&name=$encodedObject"
$metadata = @{
  name = $ObjectName
  contentType = 'application/vnd.android.package-archive'
  metadata = @{ firebaseStorageDownloadTokens = $downloadToken }
} | ConvertTo-Json -Depth 4 -Compress

$headers = @{ Authorization = "Bearer $accessToken"; 'X-Upload-Content-Type' = 'application/vnd.android.package-archive' }
$init = Invoke-WebRequest -UseBasicParsing -Method Post -Uri $initUri -Headers $headers -ContentType 'application/json; charset=UTF-8' -Body $metadata
$sessionUri = [string]$init.Headers.Location
if (-not $sessionUri) { throw 'Firebase Storage did not return a resumable upload URL.' }

$file = [System.IO.File]::OpenRead((Resolve-Path -LiteralPath $ApkPath))
$http = New-Object System.Net.Http.HttpClient
try {
  $chunkSize = 1MB
  $buffer = New-Object byte[] $chunkSize
  $offset = [int64]0
  while (($read = $file.Read($buffer, 0, $buffer.Length)) -gt 0) {
    $bytes = if ($read -eq $buffer.Length) { $buffer } else { $buffer[0..($read - 1)] }
    $content = New-Object System.Net.Http.ByteArrayContent -ArgumentList (,$bytes)
    $content.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse('application/vnd.android.package-archive')
    $end = $offset + $read - 1
    $content.Headers.ContentRange = New-Object System.Net.Http.Headers.ContentRangeHeaderValue($offset, $end, $file.Length)
    $response = $http.PutAsync($sessionUri, $content).GetAwaiter().GetResult()
    if (-not ($response.IsSuccessStatusCode -or [int]$response.StatusCode -eq 308)) {
      $detail = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
      throw "Storage upload failed with HTTP $([int]$response.StatusCode): $detail"
    }
    $offset += $read
    Write-Progress -Activity 'Uploading Android APK to Firebase Storage' -Status "$offset of $($file.Length) bytes" -PercentComplete (($offset / $file.Length) * 100)
  }
} finally {
  $file.Dispose()
  $http.Dispose()
}

$downloadUrl = "https://firebasestorage.googleapis.com/v0/b/$encodedBucket/o/${encodedObject}?alt=media&token=$downloadToken"
Write-Output "Uploaded $ObjectName ($((Get-Item -LiteralPath $ApkPath).Length) bytes)"
Write-Output $downloadUrl

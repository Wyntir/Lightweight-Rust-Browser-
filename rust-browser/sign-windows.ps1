param(
  [Parameter(Mandatory = $true)]
  [string]$ExePath,
  [switch]$TrustLocally
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $ExePath)) {
  throw "Executable not found: $ExePath"
}

$resolvedExe = (Resolve-Path -LiteralPath $ExePath).Path
$timestampUrl = "http://timestamp.digicert.com"
$cert = $null

# 1. Production signing: use CA-issued PFX if provided via environment variables
if ($env:FERROX_SIGN_PFX -and (Test-Path -LiteralPath $env:FERROX_SIGN_PFX)) {
  Write-Host "[FerroX Sign] Using provided PFX certificate: $env:FERROX_SIGN_PFX"
  $secPass = $null
  if ($env:FERROX_SIGN_PASSWORD) {
    $secPass = ConvertTo-SecureString -String $env:FERROX_SIGN_PASSWORD -Force -AsPlainText
  }
  $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2(
    $env:FERROX_SIGN_PFX,
    $secPass,
    [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable
  )
} else {
  # 2. Local trusted Authenticode certificate (eliminates 'Unknown Publisher' on this PC)
  $subject = "CN=FerroX Browser Local Publisher"
  $cert = Get-ChildItem -Path Cert:\CurrentUser\My -CodeSigningCert |
    Where-Object { $_.Subject -eq $subject -and $_.NotAfter -gt (Get-Date).AddDays(7) } |
    Sort-Object NotAfter -Descending |
    Select-Object -First 1

  if (-not $cert) {
    Write-Host "[FerroX Sign] Generating local RSA-3072 Code Signing certificate..."
    $cert = New-SelfSignedCertificate `
      -Type CodeSigningCert `
      -Subject $subject `
      -FriendlyName "FerroX Browser Local Code Signing" `
      -CertStoreLocation "Cert:\CurrentUser\My" `
      -KeyAlgorithm RSA `
      -KeyLength 3072 `
      -HashAlgorithm SHA256 `
      -NotAfter (Get-Date).AddYears(5)
  }

  if ($TrustLocally) {
    $tmpCer = Join-Path $env:TEMP "ferrox-local-publisher.cer"
    Export-Certificate -Cert $cert -FilePath $tmpCer -Force | Out-Null
    try {
      $rootHas = Get-ChildItem Cert:\CurrentUser\Root | Where-Object { $_.Thumbprint -eq $cert.Thumbprint }
      if (-not $rootHas) {
        Import-Certificate -FilePath $tmpCer -CertStoreLocation Cert:\CurrentUser\Root | Out-Null
      }
      $pubHas = Get-ChildItem Cert:\CurrentUser\TrustedPublisher | Where-Object { $_.Thumbprint -eq $cert.Thumbprint }
      if (-not $pubHas) {
        Import-Certificate -FilePath $tmpCer -CertStoreLocation Cert:\CurrentUser\TrustedPublisher | Out-Null
      }
      Write-Host "[FerroX Sign] Installed local certificate into CurrentUser Root & TrustedPublisher."
    } finally {
      if (Test-Path $tmpCer) { Remove-Item $tmpCer -Force }
    }
  }
}

Write-Host "[FerroX Sign] Signing $resolvedExe with SHA-256 Authenticode..."
$sig = $null
try {
  $sig = Set-AuthenticodeSignature -FilePath $resolvedExe -Certificate $cert -HashAlgorithm SHA256 -TimestampServer $timestampUrl
} catch {
  Write-Host "[FerroX Sign] Timestamp server unreachable; signing without remote timestamp..."
  $sig = Set-AuthenticodeSignature -FilePath $resolvedExe -Certificate $cert -HashAlgorithm SHA256
}

if ($sig.Status -eq "Valid") {
  Write-Host "[FerroX Sign] Verified signature: $($sig.Status) ($($sig.SignerCertificate.Subject))"
} else {
  Write-Host "[FerroX Sign] Signature status: $($sig.Status) - $($sig.StatusMessage)"
}

param(
  [Parameter(Mandatory = $true)]
  [string]$Domain,

  [Parameter(Mandatory = $true)]
  [string]$Email,

  [string]$CertRoot = "certs/letsencrypt",

  [switch]$Staging,

  [switch]$UseWsl
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$certRootPath = Join-Path $repoRoot $CertRoot

if (-not (Test-Path $certRootPath)) {
  New-Item -ItemType Directory -Path $certRootPath -Force | Out-Null
}

function Convert-ToWslPath([string]$Path) {
  $resolved = (Resolve-Path $Path).Path
  if ($resolved -notmatch "^([A-Za-z]):\\(.*)$") {
    throw "Cannot convert path to WSL format: $resolved"
  }

  $drive = $matches[1].ToLower()
  $rest = ($matches[2] -replace "\\", "/")
  return "/mnt/$drive/$rest"
}

function Export-WindowsFriendlyCertificate([string]$DomainName) {
  $archiveRoot = Join-Path $certRootPath "archive"
  if (-not (Test-Path $archiveRoot)) {
    throw "Archive directory not found: $archiveRoot"
  }

  $lineage = Get-ChildItem -Path $archiveRoot -Directory |
    Where-Object { $_.Name -like "$DomainName*" } |
    Sort-Object Name |
    Select-Object -Last 1

  if (-not $lineage) {
    throw "No certificate lineage found for domain '$DomainName' in $archiveRoot"
  }

  $fullchainFile = Get-ChildItem -Path $lineage.FullName -File |
    Where-Object { $_.Name -match "^fullchain(\d+)\.pem$" } |
    Sort-Object { [int]($_.BaseName -replace "[^\d]", "") } |
    Select-Object -Last 1

  $privkeyFile = Get-ChildItem -Path $lineage.FullName -File |
    Where-Object { $_.Name -match "^privkey(\d+)\.pem$" } |
    Sort-Object { [int]($_.BaseName -replace "[^\d]", "") } |
    Select-Object -Last 1

  if (-not $fullchainFile -or -not $privkeyFile) {
    throw "Cannot find fullchain/privkey files in lineage '$($lineage.Name)'."
  }

  $exportDir = Join-Path $certRootPath "export/$DomainName"
  New-Item -ItemType Directory -Path $exportDir -Force | Out-Null

  $exportFullchain = Join-Path $exportDir "fullchain.pem"
  $exportPrivkey = Join-Path $exportDir "privkey.pem"

  Copy-Item -Force -Path $fullchainFile.FullName -Destination $exportFullchain
  Copy-Item -Force -Path $privkeyFile.FullName -Destination $exportPrivkey

  return @{
    Lineage = $lineage.Name
    RelativeCertPath = (Join-Path $CertRoot "export/$DomainName/fullchain.pem") -replace "\\", "/"
    RelativeKeyPath = (Join-Path $CertRoot "export/$DomainName/privkey.pem") -replace "\\", "/"
  }
}

function Invoke-DockerCertbot() {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker CLI is not installed or not available in PATH."
  }

  docker info *> $null
  if ($LASTEXITCODE -ne 0) {
    throw "Docker Engine is not running."
  }

  $certRootForDocker = $certRootPath -replace "\\", "/"
  $dockerArgs = @(
    "run",
    "--rm",
    "-p", "80:80",
    "-v", "${certRootForDocker}:/etc/letsencrypt",
    "certbot/certbot",
    "certonly",
    "--standalone",
    "--preferred-challenges", "http",
    "--non-interactive",
    "--agree-tos",
    "--email", $Email,
    "-d", $Domain
  )

  if ($Staging) {
    $dockerArgs += "--staging"
  }

  & docker @dockerArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Certbot (Docker) failed with exit code $LASTEXITCODE."
  }
}

function Invoke-WslCertbot() {
  if (-not (Get-Command wsl -ErrorAction SilentlyContinue)) {
    throw "WSL is not available in PATH."
  }

  $certRootForWsl = Convert-ToWslPath -Path $certRootPath
  $wslArgs = @(
    "certbot",
    "certonly",
    "--standalone",
    "--preferred-challenges", "http",
    "--non-interactive",
    "--agree-tos",
    "--email", $Email,
    "-d", $Domain,
    "--config-dir", $certRootForWsl,
    "--work-dir", "$certRootForWsl/work",
    "--logs-dir", "$certRootForWsl/logs"
  )

  if ($Staging) {
    $wslArgs += "--staging"
  }

  & wsl @wslArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Certbot (WSL) failed with exit code $LASTEXITCODE."
  }
}

$mode = "docker"
if ($UseWsl) {
  $mode = "wsl"
} else {
  $hasDocker = $null -ne (Get-Command docker -ErrorAction SilentlyContinue)
  $hasWsl = $null -ne (Get-Command wsl -ErrorAction SilentlyContinue)

  if ($hasDocker) {
    docker info *> $null
    if ($LASTEXITCODE -ne 0 -and $hasWsl) {
      $mode = "wsl"
    }
  } elseif ($hasWsl) {
    $mode = "wsl"
  } else {
    throw "Neither Docker (running) nor WSL is available for certbot execution."
  }
}

Write-Host "Requesting Let's Encrypt certificate for $Domain via $mode ..."
if ($mode -eq "wsl") {
  Invoke-WslCertbot
} else {
  Invoke-DockerCertbot
}

$exported = Export-WindowsFriendlyCertificate -DomainName $Domain

Write-Host ""
Write-Host "Certificate requested successfully."
Write-Host "Lineage: $($exported.Lineage)"
Write-Host "Windows-friendly certificate files were exported."
Write-Host "Set these variables before npm start:"
Write-Host "  `$env:SSL_KEY_PATH='$($exported.RelativeKeyPath)'"
Write-Host "  `$env:SSL_CERT_PATH='$($exported.RelativeCertPath)'"
Write-Host "  `$env:PORT='443'"

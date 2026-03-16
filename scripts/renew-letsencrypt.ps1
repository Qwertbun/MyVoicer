param(
  [string]$CertRoot = "certs/letsencrypt",
  [switch]$UseWsl
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$certRootPath = Join-Path $repoRoot $CertRoot

if (-not (Test-Path $certRootPath)) {
  throw "Certificate directory not found: $certRootPath"
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

function Export-WindowsFriendlyCertificates() {
  $archiveRoot = Join-Path $certRootPath "archive"
  if (-not (Test-Path $archiveRoot)) {
    throw "Archive directory not found: $archiveRoot"
  }

  $lineages = Get-ChildItem -Path $archiveRoot -Directory
  if (-not $lineages) {
    throw "No certificate lineages found in $archiveRoot"
  }

  foreach ($lineage in $lineages) {
    $fullchainFile = Get-ChildItem -Path $lineage.FullName -File |
      Where-Object { $_.Name -match "^fullchain(\d+)\.pem$" } |
      Sort-Object { [int]($_.BaseName -replace "[^\d]", "") } |
      Select-Object -Last 1

    $privkeyFile = Get-ChildItem -Path $lineage.FullName -File |
      Where-Object { $_.Name -match "^privkey(\d+)\.pem$" } |
      Sort-Object { [int]($_.BaseName -replace "[^\d]", "") } |
      Select-Object -Last 1

    if (-not $fullchainFile -or -not $privkeyFile) {
      continue
    }

    $domainFolder = $lineage.Name -replace "-\d{4}$", ""
    $exportDir = Join-Path $certRootPath "export/$domainFolder"
    New-Item -ItemType Directory -Path $exportDir -Force | Out-Null

    Copy-Item -Force -Path $fullchainFile.FullName -Destination (Join-Path $exportDir "fullchain.pem")
    Copy-Item -Force -Path $privkeyFile.FullName -Destination (Join-Path $exportDir "privkey.pem")
  }
}

function Invoke-DockerRenew() {
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
    "renew",
    "--standalone",
    "--preferred-challenges", "http",
    "--non-interactive"
  )

  & docker @dockerArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Certbot renew (Docker) failed with exit code $LASTEXITCODE."
  }
}

function Invoke-WslRenew() {
  if (-not (Get-Command wsl -ErrorAction SilentlyContinue)) {
    throw "WSL is not available in PATH."
  }

  $certRootForWsl = Convert-ToWslPath -Path $certRootPath
  $wslArgs = @(
    "certbot",
    "renew",
    "--standalone",
    "--preferred-challenges", "http",
    "--non-interactive",
    "--config-dir", $certRootForWsl,
    "--work-dir", "$certRootForWsl/work",
    "--logs-dir", "$certRootForWsl/logs"
  )

  & wsl @wslArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Certbot renew (WSL) failed with exit code $LASTEXITCODE."
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
    throw "Neither Docker (running) nor WSL is available for certbot renewal."
  }
}

Write-Host "Renewing Let's Encrypt certificates via $mode ..."
if ($mode -eq "wsl") {
  Invoke-WslRenew
} else {
  Invoke-DockerRenew
}

Export-WindowsFriendlyCertificates
Write-Host "Renewal finished. Windows-friendly export files updated in '$CertRoot/export/'."

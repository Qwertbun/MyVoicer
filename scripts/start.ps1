$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$env:PORT = "3001"
$env:HOST = "0.0.0.0"

$env:SSL_CERT_PATH = Join-Path $projectRoot "certs\letsencrypt\export\lan.mine-souls.ru\fullchain.pem"
$env:SSL_KEY_PATH = Join-Path $projectRoot "certs\letsencrypt\export\lan.mine-souls.ru\privkey.pem"

$env:TURN_URLS = "turn:owa.mine-souls.ru:3478?transport=udp,turn:owa.mine-souls.ru:3478?transport=tcp,turns:owa.mine-souls.ru:5349?transport=tcp"
$env:TURN_USERNAME = "lan"
$env:TURN_PASSWORD = "258741963"

node server.js

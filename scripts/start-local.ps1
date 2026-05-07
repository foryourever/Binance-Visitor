param(
  [int]$Port = 5174
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root
$env:PORT = "$Port"
npm start *> server.log

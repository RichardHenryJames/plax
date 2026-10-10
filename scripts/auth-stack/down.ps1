#requires -Version 7.4
# Removes the local test stack completely: containers, network, volume and the generated secrets.
Set-Location $PSScriptRoot
if (Test-Path .env) { docker compose --env-file .env down -v --remove-orphans } else { docker compose down -v --remove-orphans }
Remove-Item .env, kong.yml -Force -ErrorAction SilentlyContinue
$left = @(docker ps -a --filter 'name=plaxauth' --format '{{.Names}}')
Write-Output "containers left: $($left.Count)"

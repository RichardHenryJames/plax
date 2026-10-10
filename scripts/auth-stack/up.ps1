#requires -Version 7.4
<#
Brings up the local Supabase test stack (see docker-compose.yml) and loads the project's supabase-schema.sql into it,
the way the SQL editor would. It needs Docker, uses only 127.0.0.1 and writes two ignored files here: .env (throwaway
secrets, generated once) and kong.yml (the gateway's keys). Order matters: GoTrue creates auth.users, which the
schema refers to, and PostgREST reads the schema when it starts.

  .\scripts\auth-stack\up.ps1
  $env:PLAX_LOCAL_STACK = "$PWD\scripts\auth-stack\.env"     # then the Android test runs against it, see android\README.md
  .\scripts\check-accounts.ps1 -Url http://127.0.0.1:54321 -AnonKey <ANON_KEY from .env> -SkipSite
  .\scripts\auth-stack\down.ps1                               # removes containers, volume and secrets
#>
param([string]$Schema = (Join-Path $PSScriptRoot '..\..\supabase-schema.sql'))
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function B64Url([byte[]]$bytes) { [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_') }
function Jwt([string]$secret, [hashtable]$payload) {
    $header = B64Url ([Text.Encoding]::UTF8.GetBytes('{"alg":"HS256","typ":"JWT"}'))
    $body = B64Url ([Text.Encoding]::UTF8.GetBytes(($payload | ConvertTo-Json -Compress)))
    $hmac = [Security.Cryptography.HMACSHA256]::new([Text.Encoding]::UTF8.GetBytes($secret))
    "$header.$body." + (B64Url ($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes("$header.$body"))))
}
function Random-Hex([int]$bytes) { ([Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes($bytes))).ToLower() }

if (-not (Test-Path .env)) {
    $secret = Random-Hex 32; $password = Random-Hex 16
    $iat = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds(); $exp = $iat + 7 * 24 * 3600
    $anon = Jwt $secret @{ role = 'anon'; iss = 'plax-local'; iat = $iat; exp = $exp }
    $service = Jwt $secret @{ role = 'service_role'; iss = 'plax-local'; iat = $iat; exp = $exp }
    # The redirect allow-list is exactly what SUPABASE_SETUP.md, step 6, tells the owner to enter.
    $allow = 'https://www.plaxlabs.com/news/auth/callback,https://plaxlabs.com/news/auth/callback,https://www.plaxlabs.com/news/auth/app**,http://localhost:3000/news/auth/callback'
    @("JWT_SECRET=$secret", "DB_PASSWORD=$password", "ANON_KEY=$anon", "SERVICE_KEY=$service", "URI_ALLOW_LIST=$allow") | Set-Content .env -Encoding utf8
}
$config = @{}; Get-Content .env | ForEach-Object { $k, $v = $_ -split '=', 2; $config[$k] = $v }
(Get-Content kong.template.yml -Raw).Replace('__ANON_KEY__', $config.ANON_KEY).Replace('__SERVICE_KEY__', $config.SERVICE_KEY) | Set-Content kong.yml -Encoding utf8

function Compose { docker compose --env-file .env @args; if ($LASTEXITCODE -ne 0) { throw "docker compose $args failed" } }
function Psql([string]$sql, [string]$user = 'postgres') { $sql | docker compose --env-file .env exec -T db psql -U $user -d postgres -v ON_ERROR_STOP=1 -q; if ($LASTEXITCODE -ne 0) { throw 'psql failed' } }

Write-Output '== database'
Compose up -d --wait db
$pw = $config.DB_PASSWORD
# Reserved roles can only be changed by the real superuser; the project's own SQL runs as postgres, as in the SQL editor.
Psql "ALTER ROLE authenticator WITH PASSWORD '$pw'; ALTER ROLE supabase_auth_admin WITH PASSWORD '$pw';" 'supabase_admin'

Write-Output '== auth (creates auth.users)'
Compose up -d auth mail
$end = (Get-Date).AddSeconds(90)
do { Start-Sleep -Seconds 2; $health = (curl.exe -s -o NUL -w '%{http_code}' http://127.0.0.1:54326/health) } while ($health -ne '200' -and (Get-Date) -lt $end)
if ($health -ne '200') { docker compose --env-file .env logs auth --tail 40; throw 'GoTrue did not become healthy' }

Write-Output '== the project schema, as the SQL editor would run it'
Get-Content $Schema -Raw | docker compose --env-file .env exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q 2>&1 | Where-Object { $_ -notmatch '^NOTICE' }
if ($LASTEXITCODE -ne 0) { throw 'The schema did not apply' }

Write-Output '== rest and gateway'
Compose up -d rest kong
$end = (Get-Date).AddSeconds(60)
do { Start-Sleep -Seconds 2; $rest = (curl.exe -s -o NUL -w '%{http_code}' -H "apikey: $($config.ANON_KEY)" http://127.0.0.1:54321/rest/v1/) } while ($rest -ne '200' -and (Get-Date) -lt $end)
Write-Output "gateway /rest/v1/ -> $rest   /auth/v1/settings -> $(curl.exe -s -o NUL -w '%{http_code}' -H "apikey: $($config.ANON_KEY)" http://127.0.0.1:54321/auth/v1/settings)"
if ($rest -ne '200') { throw 'The gateway is not answering' }
Write-Output "Ready. PLAX_LOCAL_STACK=$PSScriptRoot\.env"

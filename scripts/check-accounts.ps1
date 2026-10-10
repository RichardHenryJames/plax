#requires -Version 7.4
<#
Checks, read-only, that Plax's account service really works, and says what to fix when it does not. Run it after
restoring or recreating the Supabase project (see SUPABASE_SETUP.md) and again whenever sign-in is reported broken.
It asks the website where the accounts live, exactly as the Android app does, and then checks that project:

  - the website publishes the project address and key
  - the address resolves and answers over HTTPS
  - Google sign-in is switched on, new readers may sign up, and Google receives a client id and the right callback
  - the tables exist and row-level security hides them from anyone who is not signed in
  - the reading-streak function cannot be used on other readers (the 2026-10-10 schema fix is applied)
  - the website's daily keep-alive can reach the database (this is what stops a free project pausing)

Not checked, because they need a browser and your Google account: the Google consent screen itself, the Authorized
redirect URI in the Google Cloud console and the Redirect URLs list in Supabase (SUPABASE_SETUP.md, steps 5 and 6).
The script prints the callback address Google must have been given, to compare.

  .\scripts\check-accounts.ps1
  .\scripts\check-accounts.ps1 -Site http://localhost:3000/news
  .\scripts\check-accounts.ps1 -Url http://127.0.0.1:54321 -AnonKey <key> -SkipSite     # a project directly, e.g. the local test stack

It sends only GET requests, plus one POST that a protected project refuses and that could not change anything anyway
(it names the all-zero user id, which has no row). Opening Google's sign-in address creates one short-lived,
unused sign-in record in the project. Exit code 0 means every check passed.
#>
param(
    [string]$Site = 'https://www.plaxlabs.com/news',
    [string]$Url = '',
    [string]$AnonKey = '',
    [switch]$SkipSite
)
$ErrorActionPreference = 'Stop'
$failures = [System.Collections.Generic.List[string]]::new()
function Check([string]$Name, [bool]$Passed, [string]$Detail = '', [string]$Fix = '') {
    if ($Passed) { Write-Output "  ok    $Name"; return }
    Write-Output "  FAIL  $Name $Detail"
    if ($Fix) { Write-Output "        -> $Fix" }
    $failures.Add($Name)
}

Add-Type -AssemblyName System.Net.Http
$handler = [System.Net.Http.HttpClientHandler]::new()
$handler.AllowAutoRedirect = $false
$handler.UseCookies = $false
$http = [System.Net.Http.HttpClient]::new($handler)
$http.Timeout = [TimeSpan]::FromSeconds(25)
function Send([string]$Method, [string]$Address, [hashtable]$Headers = @{}, [string]$Body = $null) {
    $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::new($Method), $Address)
    foreach ($name in $Headers.Keys) { [void]$request.Headers.TryAddWithoutValidation($name, $Headers[$name]) }
    if ($null -ne $Body) { $request.Content = [System.Net.Http.StringContent]::new($Body, [System.Text.Encoding]::UTF8, 'application/json') }
    try {
        $response = $http.SendAsync($request).GetAwaiter().GetResult()
        [pscustomobject]@{ Status = [int]$response.StatusCode; Text = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult(); Location = [string]$response.Headers.Location; Error = '' }
    } catch {
        [pscustomobject]@{ Status = 0; Text = ''; Location = ''; Error = $_.Exception.GetBaseException().Message }
    }
}
function Json([string]$Text) {
    # -NoEnumerate and the comma keep an empty array "[]" an empty array instead of letting PowerShell turn it into nothing.
    try { , ($Text | ConvertFrom-Json -NoEnumerate -ErrorAction Stop) } catch { $null }
}
function Stop-Here([string]$Why) {
    Write-Output ''
    Write-Output "Cannot go on: $Why"
    Write-Output "$($failures.Count) check(s) failed."
    exit 1
}

$runbook = 'SUPABASE_SETUP.md'
Write-Output 'Plax account service'

# 1. Where the accounts live
if ($Url -eq '') {
    if ($SkipSite) { throw '-SkipSite needs -Url and -AnonKey.' }
    $published = Send 'GET' "$Site/api/auth-config" @{ Accept = 'application/json' }
    Check 'the website publishes the account project (/api/auth-config)' ($published.Status -eq 200) "(HTTP $($published.Status) $($published.Error))" "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY on Vercel and redeploy ($runbook, step 7)."
    $config = Json $published.Text
    if (-not $config -or -not $config.url -or -not $config.anonKey) { Stop-Here 'the website did not publish an account project, so there is nothing to check.' }
    $Url = ([string]$config.url).TrimEnd('/'); $AnonKey = [string]$config.anonKey
    Check 'the address is one the Android app accepts (https, <ref>.supabase.co)' ($Url -match '^https://[a-z0-9]{8,40}\.supabase\.co$') "($Url)" 'The app only signs in to a Supabase project address; check NEXT_PUBLIC_SUPABASE_URL.'
    Check 'the key has a shape the app accepts' ($AnonKey -match '^[A-Za-z0-9._-]{20,2000}$') '' 'Use the anon (legacy) or publishable key, not the secret one.'
} elseif ($AnonKey -eq '') { throw '-Url needs -AnonKey.' }
$hostName = ([uri]$Url).Host
Write-Output "  project: $hostName"

# 2. Reachable
$resolves = $true
try { [void][System.Net.Dns]::GetHostAddresses($hostName) } catch { $resolves = $false }
Check 'the project address resolves in DNS' $resolves '' "A project that is paused or deleted stops resolving. Open the Supabase dashboard and click 'Restore project' (paused free projects can be restored for 90 days), or create a new one ($runbook, option B)."
if (-not $resolves) { Stop-Here 'the account project does not exist on the internet, so nothing else can be checked. Sign-in cannot work until it is restored or replaced.' }
$key = @{ apikey = $AnonKey; Accept = 'application/json' }
$settingsResponse = Send 'GET' "$Url/auth/v1/settings" $key
Check 'the auth service answers' ($settingsResponse.Status -eq 200) "(HTTP $($settingsResponse.Status) $($settingsResponse.Error))" 'The project may still be starting after a restore (wait a few minutes), or the key does not belong to this project.'
$settings = Json $settingsResponse.Text

# 3. Google sign-in
Check 'Google sign-in is switched on' ($settings -and $settings.external.google -eq $true) '' "Dashboard > Authentication > Providers > Google > enable, with the Google client id and secret ($runbook, steps 4 and 5)."
Check 'new readers may sign up' ($settings -and $settings.disable_signup -ne $true) '' "Dashboard > Authentication > Sign In / Providers: turn on 'Allow new users to sign up'. Otherwise only people who already have an account can sign in."
$redirect = [uri]::EscapeDataString('https://www.plaxlabs.com/news/auth/app?app=com.plaxlabs.news.preview')
$authorize = Send 'GET' "$Url/auth/v1/authorize?provider=google&redirect_to=$redirect&code_challenge=abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ&code_challenge_method=s256"
$toGoogle = $authorize.Status -eq 302 -and $authorize.Location -match '^https://accounts\.google\.com/'
Check 'the sign-in address the app opens leads to Google' $toGoogle "(HTTP $($authorize.Status) $($authorize.Error))" "Enable the Google provider and give it a client id and secret ($runbook, steps 4 and 5)."
if ($toGoogle) {
    Add-Type -AssemblyName System.Web
    $query = [System.Web.HttpUtility]::ParseQueryString(([uri]$authorize.Location).Query)
    Check 'Google is given a client id' (-not [string]::IsNullOrWhiteSpace($query['client_id'])) '' 'Paste the OAuth client id and secret into the Supabase Google provider.'
    Write-Output "        Google must list this callback as an Authorized redirect URI: $($query['redirect_uri'])"
}

# 4. Tables and row-level security: anyone with only the public key must see nothing.
foreach ($table in 'user_profiles', 'bookmarks', 'engagements', 'ai_cache') {
    $read = Send 'GET' "$Url/rest/v1/${table}?select=*&limit=1" $key
    $rows = Json $read.Text
    $isList = $null -ne $rows -and $rows -is [array]
    $hidden = $read.Status -eq 200 -and $isList -and $rows.Count -eq 0
    $detail = if ($read.Status -eq 200 -and $isList -and $rows.Count -gt 0) { '(it returned rows to an anonymous caller)' } else { "(HTTP $($read.Status) $($read.Error))" }
    Check "table $table exists and an anonymous caller sees no rows" $hidden $detail "Run supabase-schema.sql in the SQL editor: it is safe to run again ($runbook, step 2)."
}

# 5. The reading-streak function must not work for anyone but its owner (the schema fix of 2026-10-10).
$streak = Send 'POST' "$Url/rest/v1/rpc/update_reading_streak" ($key + @{ 'Content-Type' = 'application/json' }) '{"p_user_id":"00000000-0000-0000-0000-000000000000"}'
Check 'an anonymous caller cannot use the reading-streak function' ($streak.Status -eq 401 -or $streak.Status -eq 403) "(HTTP $($streak.Status))" "Run the current supabase-schema.sql again: the old version let anyone change another reader's streak. Running it twice is harmless."

# 6. The daily keep-alive, which is what stops a free project pausing
if (-not $SkipSite) {
    $alive = Send 'GET' "$Site/api/keep-alive"
    Check "the website's daily keep-alive reaches the database" ($alive.Status -eq 200) "(HTTP $($alive.Status): $($alive.Text.Trim()))" "SUPABASE_SERVICE_ROLE_KEY on Vercel must be this project's service_role (or secret) key; redeploy after changing it."
}

Write-Output ''
if ($failures.Count -gt 0) {
    Write-Output "$($failures.Count) check(s) failed."
    exit 1
}
Write-Output 'Everything this script can check passes. Still to do by hand: one real sign-in from the app (Account > Continue with Google), and compare the callback address above with the Google console.'

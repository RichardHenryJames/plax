#requires -Version 7.4
<#
Checks what the website really serves as the Android update, the way the app would see it: the feed over HTTPS with no
redirect, its JSON type and no-store header, the APK it names, and that the APK matches the feed, the files committed
in public/ and the signer pinned in update-signer.sha256. Run it when a deployment finishes, before telling anyone.
It writes its findings to artifacts\update-verification.json (not tracked by Git).

  .\verify-update.ps1
  .\verify-update.ps1 -Origin https://www.plaxlabs.com/news

-Fetch rehearses against a copy of the site (for example `next start`): requests go there, while the feed must still name
the real origin, as it will in production.
#>
param([string]$Origin = 'https://www.plaxlabs.com/news', [string]$Fetch = '')
$ErrorActionPreference = 'Stop'
if (-not $Fetch) { $Fetch = $Origin }
$repository = Split-Path $PSScriptRoot -Parent
$website = Join-Path $repository 'public'
$package = 'com.plaxlabs.news.preview'
$failures = [System.Collections.Generic.List[string]]::new()
$checks = [ordered]@{}
# A failed run must not leave an earlier run's "passed" report behind.
Remove-Item -LiteralPath (Join-Path $PSScriptRoot 'artifacts\update-verification.json') -Force -ErrorAction SilentlyContinue
function Check([string]$Name, [bool]$Passed, [string]$Detail = '') {
    $checks[$Name] = $Passed
    if ($Passed) { Write-Output "  ok    $Name" } else { Write-Output "  FAIL  $Name $Detail"; $failures.Add("$Name $Detail") }
}

$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$tools = Get-ChildItem (Join-Path $sdk 'build-tools') -Directory |
    Sort-Object { [version]($_.Name -replace '[^\d.].*$', '') } -Descending | Select-Object -First 1
$aapt2 = Join-Path $tools.FullName 'aapt2.exe'
$apksigner = Join-Path $tools.FullName 'apksigner.bat'

# Like the app: no redirects, no cookies, a no-store request.
Add-Type -AssemblyName System.Net.Http
$handler = [System.Net.Http.HttpClientHandler]::new()
$handler.AllowAutoRedirect = $false
$handler.UseCookies = $false
$http = [System.Net.Http.HttpClient]::new($handler)
$http.Timeout = [TimeSpan]::FromSeconds(120)
function Fetch([string]$Url) {
    $request = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Get, $Url)
    [void]$request.Headers.TryAddWithoutValidation('Cache-Control', 'no-store')
    $response = $http.SendAsync($request).GetAwaiter().GetResult()
    $cache = $null
    [void]$response.Headers.TryGetValues('Cache-Control', [ref]$cache)
    $type = $response.Content.Headers.ContentType
    [pscustomobject]@{
        Status = [int]$response.StatusCode
        Type = if ($type) { $type.MediaType } else { '' }
        Cache = if ($cache) { $cache -join ',' } else { '' }
        Bytes = $response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult()
    }
}

Write-Output "Update feed at $Fetch/updates.json"
$feedResponse = Fetch "$Fetch/updates.json"
Check 'feed answers 200 with no redirect' ($feedResponse.Status -eq 200) "(HTTP $($feedResponse.Status))"
Check 'feed is application/json' ($feedResponse.Type -eq 'application/json') "($($feedResponse.Type))"
Check 'feed is no-store' ($feedResponse.Cache -match '(^|,)\s*no-store\b') "(Cache-Control: $($feedResponse.Cache))"
Check 'feed is at most 4096 bytes' ($feedResponse.Bytes.Length -gt 0 -and $feedResponse.Bytes.Length -le 4096) "($($feedResponse.Bytes.Length) bytes)"

# The same rules the app applies: exactly these fields, the right kinds, nothing else.
$expected = @{ schemaVersion = 'Number'; versionCode = 'Number'; versionName = 'String'; minSdk = 'Number'; apkUrl = 'String'; sha256 = 'String'; size = 'Number' }
$feed = @{}
$strict = $true
try {
    $options = [System.Text.Json.JsonDocumentOptions]::new()
    $options.CommentHandling = [System.Text.Json.JsonCommentHandling]::Disallow
    $options.AllowTrailingCommas = $false
    $document = [System.Text.Json.JsonDocument]::Parse([System.ReadOnlyMemory[byte]]::new($feedResponse.Bytes), $options)
    $count = 0
    foreach ($property in $document.RootElement.EnumerateObject()) {
        $count++
        $kind = $property.Value.ValueKind.ToString()
        if (-not $expected.ContainsKey($property.Name) -or $kind -ne $expected[$property.Name] -or $feed.ContainsKey($property.Name)) { $strict = $false }
        $feed[$property.Name] = if ($kind -eq 'Number') { $property.Value.GetRawText() } else { $property.Value.GetString() }
    }
    if ($count -ne $expected.Count) { $strict = $false }
} catch { $strict = $false }
Check 'feed has exactly the fields and kinds the app accepts' $strict
$valid = $strict -and $feed.schemaVersion -eq '1' -and $feed.versionCode -match '^[1-9][0-9]{0,9}$' -and [long]$feed.versionCode -le [int]::MaxValue `
    -and $feed.minSdk -match '^[1-9][0-9]{0,9}$' -and [int]$feed.minSdk -ge 26 -and [int]$feed.minSdk -le 1000 `
    -and $feed.size -match '^[1-9][0-9]{0,9}$' -and [long]$feed.size -le 95MB `
    -and $feed.versionName -cmatch '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$' -and $feed.versionName.Length -le 40 `
    -and $feed.sha256 -cmatch '^[0-9a-f]{64}$' -and $feed.apkUrl -ceq "$Origin/plax-$($feed.versionName).apk"
Check 'feed values pass the app''s checks, and the file is this site''s exact versioned APK' $valid
if (-not $valid) { throw "The feed is not acceptable to the app:`n  $($failures -join "`n  ")" }

Write-Output "Build $($feed.versionName) (code $($feed.versionCode))"
$localFeedPath = Join-Path $website 'updates.json'
if (Test-Path $localFeedPath) {
    $local = Get-Content $localFeedPath -Raw | ConvertFrom-Json
    $same = $local.versionCode -eq [int]$feed.versionCode -and $local.versionName -eq $feed.versionName -and $local.sha256 -eq $feed.sha256 `
        -and $local.size -eq [long]$feed.size -and $local.apkUrl -eq $feed.apkUrl -and $local.minSdk -eq [int]$feed.minSdk
    Check 'the served feed is the one committed in public/' $same
} else { Check 'public/updates.json exists to compare with' $false }

$download = $feed.apkUrl.Replace($Origin, $Fetch)
Write-Output "APK at $download"
$apkResponse = Fetch $download
Check 'APK answers 200 with no redirect' ($apkResponse.Status -eq 200) "(HTTP $($apkResponse.Status))"
Check 'APK is served as an Android package' ($apkResponse.Type -eq 'application/vnd.android.package-archive') "($($apkResponse.Type))"
Check 'APK size matches the feed' ($apkResponse.Bytes.Length -eq [long]$feed.size) "($($apkResponse.Bytes.Length) vs $($feed.size))"
$temporary = Join-Path ([System.IO.Path]::GetTempPath()) "plax-verify-$($feed.versionName).apk"
[System.IO.File]::WriteAllBytes($temporary, $apkResponse.Bytes)
try {
    $served = (Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash.ToLowerInvariant()
    Check 'APK SHA-256 matches the feed' ($served -eq $feed.sha256) "($served)"
    $localApk = Join-Path $website "plax-$($feed.versionName).apk"
    Check 'APK is the file committed in public/' ((Test-Path $localApk) -and (Get-FileHash -LiteralPath $localApk -Algorithm SHA256).Hash.ToLowerInvariant() -eq $served)

    $badging = @(& $aapt2 dump badging $temporary)
    $header = ($badging | Where-Object { $_ -like 'package:*' } | Select-Object -First 1)
    $named = $header -match "name='([^']+)' versionCode='(\d+)' versionName='([^']+)'"
    $identity = if ($named) { @($Matches[1], $Matches[2], $Matches[3]) } else { @('', '', '') }
    Check 'APK is the Plax preview package' ($identity[0] -eq $package) "($($identity[0]))"
    Check 'APK version code matches the feed' ($identity[1] -eq $feed.versionCode) "($($identity[1]))"
    Check 'APK version name matches the feed' ($identity[2] -eq "$($feed.versionName)-preview") "($($identity[2]))"
    $minSdk = if (($badging | Where-Object { $_ -match "^(?:minSdkVersion|sdkVersion):'\d+'" } | Select-Object -First 1) -match "'(\d+)'") { $Matches[1] } else { '' }
    Check 'APK minimum SDK matches the feed' ($minSdk -eq $feed.minSdk) "($minSdk)"
    Check 'APK is not debuggable' (-not ($badging -contains 'application-debuggable'))

    $certificates = @(& $apksigner verify --print-certs $temporary)
    Check 'APK signature verifies' ($LASTEXITCODE -eq 0)
    $signers = @([regex]::Matches(($certificates -join "`n"), 'Signer #\d+ certificate SHA-256 digest: ([0-9a-f]{64})') | ForEach-Object { $_.Groups[1].Value })
    $pin = Join-Path $PSScriptRoot 'update-signer.sha256'
    $pinned = if (Test-Path $pin) { (Get-Content $pin -Raw).Trim() } else { '' }
    Check 'APK is signed by the pinned update signer' ($signers.Count -eq 1 -and $signers[0] -eq $pinned) "($($signers -join ','))"
} finally { Remove-Item -LiteralPath $temporary -Force -ErrorAction SilentlyContinue }

$artifacts = Join-Path $PSScriptRoot 'artifacts'
New-Item -ItemType Directory -Path $artifacts -Force | Out-Null
[ordered]@{
    origin = $Origin; fetchedFrom = $Fetch; versionName = $feed.versionName; versionCode = [int]$feed.versionCode; sha256 = $feed.sha256; size = [long]$feed.size
    checkedAtUtc = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'); passed = ($failures.Count -eq 0); checks = $checks
} | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $artifacts 'update-verification.json')
if ($failures.Count -gt 0) { throw "What the site serves is not a working update:`n  $($failures -join "`n  ")" }
Write-Output "Verified: the site serves $($feed.versionName) (code $($feed.versionCode)) as a valid update."

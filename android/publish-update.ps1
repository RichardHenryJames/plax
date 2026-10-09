#requires -Version 7.4
<#
Publishes a built Android APK as the website's update: copies it to public/plax-<version>.apk and writes
public/updates.json, the feed the app reads. It only changes files. Committing and pushing them is what deploys
the website, and verify-update.ps1 then checks what is really being served. See README.md, "Publishing an update".

  .\publish-update.ps1                     # the preview build from build.ps1
  .\publish-update.ps1 -Apk C:\path\x.apk  # another build of the same package
#>
param([string]$Apk = (Join-Path $PSScriptRoot 'app\build\outputs\apk\preview\app-preview.apk'))
$ErrorActionPreference = 'Stop'
$repository = Split-Path $PSScriptRoot -Parent
$website = Join-Path $repository 'public'
$pin = Join-Path $PSScriptRoot 'update-signer.sha256'
$package = 'com.plaxlabs.news.preview'      # the one build distributed from the website
$origin = 'https://www.plaxlabs.com/news'   # keep in step with AppUpdates.ORIGIN
$minimumSdk = 26                            # keep in step with minSdk in app/build.gradle
$sizeLimit = 95MB                           # the app refuses anything larger

$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$tools = Get-ChildItem (Join-Path $sdk 'build-tools') -Directory |
    Sort-Object { [version]($_.Name -replace '[^\d.].*$', '') } -Descending | Select-Object -First 1
if (-not $tools) { throw 'Install Android SDK build-tools and set ANDROID_HOME.' }
$aapt2 = Join-Path $tools.FullName 'aapt2.exe'
$apksigner = Join-Path $tools.FullName 'apksigner.bat'

if (-not (Test-Path -LiteralPath $Apk -PathType Leaf)) { throw "No APK at $Apk. Run build.ps1 first." }
$Apk = (Resolve-Path -LiteralPath $Apk).Path

# What the APK says about itself.
$badging = @(& $aapt2 dump badging $Apk)
if ($LASTEXITCODE -ne 0) { throw 'aapt2 could not read the APK.' }
$header = $badging | Where-Object { $_ -like 'package:*' } | Select-Object -First 1
if ($header -notmatch "name='([^']+)' versionCode='(\d+)' versionName='([^']+)'") { throw 'The APK has no readable version.' }
$apkPackage, $versionCode, $versionName = $Matches[1], [int]$Matches[2], $Matches[3]
$minSdk = if (($badging | Where-Object { $_ -match "^(?:minSdkVersion|sdkVersion):'\d+'" } | Select-Object -First 1) -match "'(\d+)'") { [int]$Matches[1] } else { throw 'The APK has no minimum SDK.' }
if ($apkPackage -ne $package) { throw "This is $apkPackage. Only $package is distributed from the website." }
if ($badging -contains 'application-debuggable') { throw 'A debuggable build must not be published.' }
if ($versionName -notmatch '^(\d+\.\d+\.\d+)-preview$') { throw "Unexpected version name $versionName; the preview build is x.y.z-preview." }
$version = $Matches[1]
if ($versionCode -lt 1 -or $minSdk -lt $minimumSdk) { throw 'The APK version code or minimum SDK is not acceptable to the app.' }

# It must be a build of the source as it is now, not an older one left in the build folder.
$gradle = Get-Content (Join-Path $PSScriptRoot 'app\build.gradle') -Raw
$sourceCode = if ($gradle -match 'versionCode (\d+)') { [int]$Matches[1] } else { 0 }
$sourceName = if ($gradle -match "versionName '([^']+)'") { $Matches[1] } else { '' }
if ($sourceCode -ne $versionCode -or "$sourceName-preview" -ne $versionName) {
    throw "The APK is $versionName ($versionCode) but app/build.gradle says $sourceName ($sourceCode). Rebuild with build.ps1."
}

# The signer: Android only installs an update signed by the same key as the installed app, so a different key
# would leave every installed copy unable to update. The first publication pins it; after that it must match.
$certificates = @(& $apksigner verify --print-certs $Apk)
if ($LASTEXITCODE -ne 0) { throw 'The APK signature does not verify.' }
$signers = @([regex]::Matches(($certificates -join "`n"), 'Signer #\d+ certificate SHA-256 digest: ([0-9a-f]{64})') |
    ForEach-Object { $_.Groups[1].Value })
if ($signers.Count -ne 1) { throw 'The APK must have exactly one signer.' }
$signer = $signers[0]
if (Test-Path $pin) {
    $pinned = (Get-Content $pin -Raw).Trim()
    if ($pinned -ne $signer) {
        throw "This APK is signed with $signer, but updates are pinned to $pinned (update-signer.sha256). Installed copies cannot update to a build signed with another key; change the pin only with a plan for them."
    }
} else {
    [System.IO.File]::WriteAllText($pin, "$signer`n", [System.Text.UTF8Encoding]::new($false))
    Write-Output "Pinned the update signer ($signer) in update-signer.sha256. Commit that file."
}

$hash = (Get-FileHash -LiteralPath $Apk -Algorithm SHA256).Hash.ToLowerInvariant()
$size = (Get-Item -LiteralPath $Apk).Length
if ($size -lt 1 -or $size -gt $sizeLimit) { throw 'The APK size is not acceptable to the app.' }

# Never go backwards, and never silently replace a version that was already published.
$feedFile = Join-Path $website 'updates.json'
if (Test-Path $feedFile) {
    $published = Get-Content $feedFile -Raw | ConvertFrom-Json
    if ($versionCode -lt $published.versionCode) { throw "The published update is $($published.versionName) ($($published.versionCode)); this build is older." }
    if ($versionCode -eq $published.versionCode -and $hash -ne $published.sha256) {
        throw "Version $versionCode is already published with different contents. Bump versionCode and versionName instead."
    }
}

New-Item -ItemType Directory -Path $website -Force | Out-Null
$target = Join-Path $website "plax-$version.apk"
Copy-Item -LiteralPath $Apk -Destination $target -Force
# Only the advertised build is kept on the site; earlier files stay in Git history.
Get-ChildItem $website -Filter 'plax-*.apk' | Where-Object { $_.FullName -ne $target } | Remove-Item -Force

$feed = [ordered]@{
    schemaVersion = 1
    versionCode = $versionCode
    versionName = $version
    minSdk = $minSdk
    apkUrl = "$origin/plax-$version.apk"
    sha256 = $hash
    size = $size
}
# UTF-8 without a byte order mark, which Windows PowerShell's own encodings would add.
[System.IO.File]::WriteAllText($feedFile, (($feed | ConvertTo-Json) + "`n"), [System.Text.UTF8Encoding]::new($false))
if ((Get-Item $feedFile).Length -gt 4096) { throw 'The feed is larger than the app accepts.' }

Write-Output "Prepared $version (code $versionCode, minSdk $minSdk, $size bytes, sha256 $hash)."
Write-Output "  public\plax-$version.apk"
Write-Output "  public\updates.json"
Write-Output 'Not published yet. Run the website checks, then commit and push these files with android\update-signer.sha256;'
Write-Output 'when the deployment finishes run .\verify-update.ps1 to check what the site serves.'

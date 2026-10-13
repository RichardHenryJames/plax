#requires -Version 7.4
<#
Builds the Plax bundle (.aab) for Google Play, checks it, and leaves it at artifacts\plax-<version>.aab with
artifacts\aab-verification.json beside it.

  .\package-aab.ps1             # build, then check
  .\package-aab.ps1 -NoBuild    # only check the bundle that is already built

It needs the upload key (see new-upload-key.ps1) and refuses to hand over a bundle that is unsigned, signed with any other
key (the Android debug key the website build uses in particular), or whose manifest is not what a Google Play build of Plax
must be: the Play package name, the version in app\build.gradle, not debuggable, no cleartext traffic, no backups, and no
permission other than the ones listed below. The checks use Google's own bundletool, downloaded once from its official release
and compared with the SHA-256 that release publishes.

What this does not prove: that Google Play accepts the app (that is the Play Console's review), or how it behaves on a given
phone. It proves the file is the signed Play build of this source and is a well-formed bundle.
#>
param([switch]$NoBuild)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$artifacts = Join-Path $root 'artifacts'
$tools = Join-Path $root '.tools'
$package = 'com.plaxlabs.news'
# Everything else (location, contacts, storage, notifications, install packages) is refused.
$allowedPermissions = @('android.permission.INTERNET', "$package.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION")

if (-not $env:JAVA_HOME) { throw 'Set JAVA_HOME to a JDK (21 is used here).' }
$java = Join-Path $env:JAVA_HOME 'bin\java.exe'
$keytool = Join-Path $env:JAVA_HOME 'bin\keytool.exe'
$jarsigner = Join-Path $env:JAVA_HOME 'bin\jarsigner.exe'
foreach ($tool in $java, $keytool, $jarsigner) { if (-not (Test-Path -LiteralPath $tool)) { throw "$tool was not found." } }

# The version this source builds.
$gradle = Get-Content (Join-Path $root 'app\build.gradle') -Raw
$versionCode = [int][regex]::Match($gradle, 'versionCode (\d+)').Groups[1].Value
$versionName = [regex]::Match($gradle, "versionName '([^']+)'").Groups[1].Value
if ($versionCode -lt 1 -or -not $versionName) { throw 'Could not read the version from app\build.gradle.' }

# The upload key: where the build reads it from, and the fingerprint the bundle must carry.
$propertiesPath = if ($env:PLAX_UPLOAD_PROPERTIES) { $env:PLAX_UPLOAD_PROPERTIES } else { Join-Path $env:USERPROFILE '.plax-signing\upload.properties' }
if (-not (Test-Path -LiteralPath $propertiesPath)) {
    throw "There is no upload key. Run .\new-upload-key.ps1 once; the build reads $propertiesPath."
}
$key = @{}
foreach ($line in Get-Content -LiteralPath $propertiesPath) {
    if ($line -match '^\s*([^#=\s][^=]*?)\s*=\s*(.*)$') { $key[$Matches[1]] = $Matches[2] }
}
foreach ($name in 'storeFile', 'storePassword', 'keyAlias', 'keyPassword') { if (-not $key[$name]) { throw "upload.properties has no $name." } }
if (-not (Test-Path -LiteralPath $key.storeFile)) { throw "The key store $($key.storeFile) is missing." }

$env:PLAX_KEY_PASSWORD = $key.storePassword
try {
    $listing = & $keytool -list -v -keystore $key.storeFile -alias $key.keyAlias -storepass:env PLAX_KEY_PASSWORD 2>&1
    $listed = $LASTEXITCODE
} finally { Remove-Item Env:PLAX_KEY_PASSWORD -ErrorAction SilentlyContinue }
if ($listed -ne 0) { throw 'keytool could not read the upload key (wrong password or damaged key store).' }
$uploadSha256 = (($listing | Select-String -Pattern 'SHA256:\s*(\S+)').Matches[0].Groups[1].Value -replace ':', '').ToLowerInvariant()
$debugSha256 = (Get-Content (Join-Path $root 'update-signer.sha256') -Raw).Trim().ToLowerInvariant()
if ($uploadSha256 -eq $debugSha256) { throw 'The upload key is the Android debug key. Make a real one with new-upload-key.ps1.' }

# Build.
$aab = Join-Path $root 'app\build\outputs\bundle\release\app-release.aab'
if (-not $NoBuild) {
    Remove-Item -LiteralPath $aab -Force -ErrorAction SilentlyContinue
    & (Join-Path $root 'build.ps1') -Tasks ':app:bundleRelease', '-PplayStore=true'
}
if (-not (Test-Path -LiteralPath $aab)) { throw "No bundle at $aab. Run without -NoBuild." }

# bundletool, from its official release, checked against the SHA-256 that release publishes.
function Get-Bundletool {
    if ($env:BUNDLETOOL_JAR -and (Test-Path -LiteralPath $env:BUNDLETOOL_JAR)) { return $env:BUNDLETOOL_JAR }
    $cached = Get-ChildItem $tools -Filter 'bundletool-all-*.jar' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
    if ($cached) {
        $sidecar = "$($cached.FullName).sha256"
        if ((Test-Path $sidecar) -and (Get-FileHash $cached.FullName -Algorithm SHA256).Hash.ToLowerInvariant() -eq (Get-Content $sidecar -Raw).Trim()) { return $cached.FullName }
        Remove-Item $cached.FullName, $sidecar -Force -ErrorAction SilentlyContinue
    }
    $release = Invoke-RestMethod 'https://api.github.com/repos/google/bundletool/releases/latest' -Headers @{ 'User-Agent' = 'plax-package-aab' }
    $asset = $release.assets | Where-Object { $_.name -match '^bundletool-all-[\d.]+\.jar$' } | Select-Object -First 1
    if (-not $asset -or $asset.digest -notmatch '^sha256:([0-9a-f]{64})$') { throw 'The bundletool release does not publish a SHA-256 to check against.' }
    $expected = $Matches[1]
    New-Item -ItemType Directory -Path $tools -Force | Out-Null
    $target = Join-Path $tools $asset.name
    Invoke-WebRequest $asset.browser_download_url -OutFile $target -Headers @{ 'User-Agent' = 'plax-package-aab' }
    $actual = (Get-FileHash $target -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne $expected) { Remove-Item $target -Force; throw "bundletool did not match its published SHA-256 ($actual)." }
    [System.IO.File]::WriteAllText("$target.sha256", "$actual`n", [System.Text.UTF8Encoding]::new($false))
    return $target
}
$bundletool = Get-Bundletool
$bundletoolVersion = [regex]::Match((Split-Path $bundletool -Leaf), 'bundletool-all-([\d.]+)\.jar').Groups[1].Value

$failures = [System.Collections.Generic.List[string]]::new()
function Check([string]$what, [bool]$ok) {
    if ($ok) { Write-Output "  ok    $what" } else { Write-Output "  FAIL  $what"; $failures.Add($what) }
}

Write-Output "Bundle $aab"
# Well-formed.
& $java -jar $bundletool validate "--bundle=$aab" *> $null
Check 'bundletool validates the bundle' ($LASTEXITCODE -eq 0)

# Signed by the upload key, and only by it.
$jar = & $jarsigner -verify $aab 2>&1
Check 'the bundle signature verifies (jarsigner)' ($LASTEXITCODE -eq 0 -and ($jar -join "`n") -match 'jar verified')
$printed = (& $keytool -printcert -jarfile $aab 2>&1) -join "`n"
$signers = @([regex]::Matches($printed, 'Signer #\d+:') | ForEach-Object { $_.Value })
$fingerprints = @([regex]::Matches($printed, 'SHA256:\s*([0-9A-F:]{95})') | ForEach-Object { ($_.Groups[1].Value -replace ':', '').ToLowerInvariant() } | Select-Object -Unique)
Check 'the bundle has exactly one signer' ($signers.Count -eq 1)
Check 'the signer is the Plax upload key' ($fingerprints.Count -eq 1 -and $fingerprints[0] -eq $uploadSha256)
Check 'the signer is not the Android debug key of the website build' ($fingerprints -notcontains $debugSha256)

# What the manifest says.
$manifest = (& $java -jar $bundletool dump manifest "--bundle=$aab" 2>&1) -join "`n"
function Attribute([string]$name) { $m = [regex]::Match($manifest, "$name=`"([^`"]*)`""); if ($m.Success) { $m.Groups[1].Value } else { $null } }
Check "the package is $package" ((Attribute 'package') -eq $package)
Check "the version is $versionName ($versionCode), as in app\build.gradle" ((Attribute 'android:versionName') -eq $versionName -and (Attribute 'android:versionCode') -eq "$versionCode")
Check 'the minimum SDK is 26' ((Attribute 'android:minSdkVersion') -eq '26')
Check 'it targets Android 16 (API 36), which Google Play requires for new apps' ((Attribute 'android:targetSdkVersion') -eq '36')
Check 'it is not debuggable' ($manifest -notmatch 'android:debuggable="true"')
Check 'cleartext (http) traffic is off' ((Attribute 'android:usesCleartextTraffic') -eq 'false')
Check 'automatic backups are off' ((Attribute 'android:allowBackup') -eq 'false')
$permissions = @([regex]::Matches($manifest, '<uses-permission[^>]*android:name="([^"]+)"') | ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique)
$extra = @($permissions | Where-Object { $_ -notin $allowedPermissions })
Check "it asks for no permission beyond $($allowedPermissions -join ', ')$(if ($extra) { " (also: $($extra -join ', '))" })" ($extra.Count -eq 0)
Check 'it does not ask to install packages (a store app may not update itself)' ($permissions -notcontains 'android.permission.REQUEST_INSTALL_PACKAGES')

# The size and contents Google Play will see.
$size = (Get-Item -LiteralPath $aab).Length
Check "it is under Google Play's 200 MB limit ($size bytes)" ($size -lt 200MB)
$sha256 = (Get-FileHash -LiteralPath $aab -Algorithm SHA256).Hash.ToLowerInvariant()

if ($failures.Count -gt 0) { throw "The bundle is not ready for Google Play: $($failures -join '; ')." }

New-Item -ItemType Directory -Path $artifacts -Force | Out-Null
$target = Join-Path $artifacts "plax-$versionName.aab"
Copy-Item -LiteralPath $aab -Destination $target -Force
$mapping = Join-Path $root 'app\build\outputs\mapping\release\mapping.txt'
if (Test-Path -LiteralPath $mapping) { Copy-Item -LiteralPath $mapping -Destination (Join-Path $artifacts "plax-$versionName-mapping.txt") -Force }
[ordered]@{
    file = "plax-$versionName.aab"; package = $package; versionName = $versionName; versionCode = $versionCode
    bytes = $size; sha256 = $sha256; signerSha256 = $uploadSha256; permissions = $permissions
    bundletool = $bundletoolVersion; checkedAtUtc = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $artifacts 'aab-verification.json') -Encoding utf8

Write-Output ''
Write-Output "Ready for Google Play: $target"
Write-Output "  $versionName (code $versionCode), $size bytes, sha256 $sha256"
Write-Output "  signed by the Plax upload key $uploadSha256"

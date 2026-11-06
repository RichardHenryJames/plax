#requires -Version 7.4
<#
Builds an Android package of the app from this folder:

  .\scripts\build-android.ps1 -Variant preview            # the website's build (APK, all four processors)
  .\scripts\build-android.ps1 -Variant play               # the Google Play build (AAB, signed with the upload key, all four processors)
  .\scripts\build-android.ps1 -Variant e2e                # the build the device tests drive (APK, x86_64 only: the emulator)
  .\scripts\build-android.ps1 -Variant play -Format apk   # the Play build as an APK, to install on a phone or the emulator

`expo prebuild` makes the android\ project from app.config.js and plugins\ each time (it is not committed); -Clean wipes it first (a full
native rebuild, about 10 minutes), without -Clean the earlier build's work is reused. The package lands in artifacts\ as
plax-<version>-<variant>.apk|aab. For the Play build it needs the upload key (see README.md, "Signing").
#>
param(
    [ValidateSet('play', 'preview', 'e2e')][string]$Variant = 'preview',
    [ValidateSet('apk', 'aab')][string]$Format = '',
    [string]$Abis = '',
    [switch]$Clean,
    [switch]$SkipPrebuild
)
$ErrorActionPreference = 'Stop'
$mobile = Split-Path $PSScriptRoot -Parent
if (-not $Format) { $Format = if ($Variant -eq 'play') { 'aab' } else { 'apk' } }
if (-not $Abis) { $Abis = if ($Variant -eq 'e2e') { 'x86_64' } else { 'armeabi-v7a,arm64-v8a,x86,x86_64' } }

$config = Get-Content (Join-Path $mobile 'app.config.js') -Raw
if ($config -notmatch "const VERSION = '([^']+)'") { throw 'No VERSION in app.config.js' }
$version = $Matches[1]
if ($config -notmatch 'const VERSION_CODE = (\d+)') { throw 'No VERSION_CODE in app.config.js' }
$code = [int]$Matches[1]

$jdk = if ($env:JAVA_HOME -and (Test-Path (Join-Path $env:JAVA_HOME 'bin\java.exe'))) { $env:JAVA_HOME } else { Join-Path $env:USERPROFILE '.jdks\openjdk-21.0.2' }
if (-not (Test-Path (Join-Path $jdk 'bin\java.exe'))) { throw 'Set JAVA_HOME to a JDK 17 or 21.' }
$env:JAVA_HOME = $jdk
$env:ANDROID_HOME = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$env:PLAX_VARIANT = $Variant

if ($Variant -eq 'play' -and $Format -eq 'aab') {
    $properties = if ($env:PLAX_UPLOAD_PROPERTIES) { $env:PLAX_UPLOAD_PROPERTIES } else { Join-Path $env:USERPROFILE '.plax-signing\upload.properties' }
    if (-not (Test-Path $properties)) { throw "The Google Play upload key is not on this machine ($properties). A bundle without it would be unsigned." }
}

Push-Location $mobile
try {
    if (-not $SkipPrebuild) {
        $arguments = @('expo', 'prebuild', '--platform', 'android', '--no-install')
        if ($Clean) { $arguments += '--clean' }
        & npx @arguments
        if ($LASTEXITCODE -ne 0) { throw 'expo prebuild failed' }
    }
    $sdkLine = 'sdk.dir=' + ($env:ANDROID_HOME -replace '\\', '\\')
    Set-Content -Path (Join-Path $mobile 'android\local.properties') -Value $sdkLine -Encoding ascii

    Push-Location (Join-Path $mobile 'android')
    try {
        $task = if ($Format -eq 'aab') { ':app:bundleRelease' } else { ':app:assembleRelease' }
        & .\gradlew.bat --console=plain $task "-PreactNativeArchitectures=$Abis"
        if ($LASTEXITCODE -ne 0) { throw "Gradle failed ($task)" }
    } finally { Pop-Location }

    $built = if ($Format -eq 'aab') { 'android\app\build\outputs\bundle\release\app-release.aab' } else { 'android\app\build\outputs\apk\release\app-release.apk' }
    $built = Join-Path $mobile $built
    if (-not (Test-Path $built)) { throw "Gradle finished but $built is not there." }
    $artifacts = Join-Path $mobile 'artifacts'
    New-Item -ItemType Directory -Force $artifacts | Out-Null
    $target = Join-Path $artifacts "plax-$version-$Variant.$Format"
    Copy-Item $built $target -Force
    $hash = (Get-FileHash $target -Algorithm SHA256).Hash.ToLowerInvariant()
    Write-Output "Built $Variant $version (code $code): $target"
    Write-Output "  $((Get-Item $target).Length) bytes, sha256 $hash"
} finally { Pop-Location }

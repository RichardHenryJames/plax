#requires -Version 7.4
param([string]$Gradle, [string[]]$Tasks = @(':app:assembleDebug', ':app:assemblePreview', ':app:testDebugUnitTest', ':app:lintDebug', ':app:lintPreview'))
$ErrorActionPreference = 'Stop'
if (-not $Gradle) {
    $wrapper = Join-Path $PSScriptRoot 'gradlew.bat'
    $local = Join-Path $PSScriptRoot '.tools\gradle-8.13\bin\gradle.bat'
    $installed = Get-Command gradle -ErrorAction SilentlyContinue
    if (Test-Path $wrapper) { $Gradle = $wrapper }
    elseif (Test-Path $local) { $Gradle = $local }
    elseif ($installed) { $Gradle = $installed.Source }
    else { throw 'Gradle 8.13 is required. Set -Gradle to its bin\gradle.bat, or generate/use the Gradle wrapper.' }
}
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
if (-not (Test-Path $env:ANDROID_HOME)) { throw 'Install Android SDK platform/build-tools 36 and set ANDROID_HOME.' }
Push-Location $PSScriptRoot
try {
    & $Gradle --console=plain --max-workers=2 @Tasks
    if ($LASTEXITCODE -ne 0) { throw 'Plax Android build/check failed.' }
} finally { Pop-Location }

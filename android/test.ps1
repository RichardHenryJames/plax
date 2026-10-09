#requires -Version 7.4
param([string]$Serial = 'emulator-5590', [switch]$LiveFeed)
$ErrorActionPreference = 'Stop'
$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
$adb = Join-Path $sdk 'platform-tools\adb.exe'
if (@(& $adb -s $Serial emu avd name) -notcontains 'Plax_News_Test') {
    throw 'Instrumentation is restricted to the dedicated Plax_News_Test emulator.'
}
if ("$(& $adb -s $Serial shell getprop sys.boot_completed)".Trim() -ne '1') { throw 'Wait for the emulator to boot.' }
foreach ($relative in @('app\build\outputs\apk\debug\app-debug.apk', 'app\build\outputs\apk\androidTest\debug\app-debug-androidTest.apk')) {
    & $adb -s $Serial install -r (Join-Path $PSScriptRoot $relative)
    if ($LASTEXITCODE -ne 0) { throw 'Plax test package installation failed.' }
}
# A freshly installed debug build is verified lazily on a slow emulator; precompile so timing is not about class loading.
foreach ($package in @('com.plaxlabs.news.preview', 'com.plaxlabs.news.preview.test')) {
    & $adb -s $Serial shell cmd package compile -f -m speed $package | Out-Null
}
$names = @('PlaxDeviceTest', 'FeedFlowTest', 'AccountDeviceTest', 'UpdateDeviceTest')
if ($LiveFeed) { $names += 'LiveFeedTest' }
$classes = ($names | ForEach-Object { "com.plaxlabs.news.$_" }) -join ','
# Every @Test must run: a test dropped by a runner or a rename would otherwise pass silently.
$count = 0
foreach ($name in $names) {
    $count += @(Select-String -Path (Join-Path $PSScriptRoot "app\src\androidTest\java\com\plaxlabs\news\$name.java") -Pattern '@Test\b').Count
}
$output = & $adb -s $Serial shell am instrument -w -r -e liveFeed $LiveFeed.IsPresent.ToString().ToLowerInvariant() -e class $classes com.plaxlabs.news.preview.test/androidx.test.runner.AndroidJUnitRunner
$exitCode = $LASTEXITCODE
$text = $output -join [Environment]::NewLine
$output | Write-Output
$artifacts = Join-Path $PSScriptRoot 'artifacts'
New-Item -ItemType Directory -Path $artifacts -Force | Out-Null
$text | Set-Content (Join-Path $artifacts 'device-tests.txt')
if ($exitCode -ne 0 -or $text -notmatch ("OK \(" + $count + " tests\)") -or $text -match 'FAILURES!!!|INSTRUMENTATION_FAILED|Process crashed|INSTRUMENTATION_STATUS_CODE: -[24]') {
    throw 'Plax instrumentation did not fully pass.'
}

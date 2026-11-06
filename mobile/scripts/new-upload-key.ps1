#requires -Version 7.4
<#
Makes the key that signs the Plax bundle for Google Play (the "upload key") and the private properties file the build reads
it from. Run it once, on the machine that builds the bundle:

  .\new-upload-key.ps1                      # writes to %USERPROFILE%\.plax-signing\
  .\new-upload-key.ps1 -Directory D:\keys   # elsewhere; then set PLAX_UPLOAD_PROPERTIES to its upload.properties

It never replaces an existing key. The passwords are random, go only into upload.properties (readable only by you), and are
never printed. The key and the file stay outside the repository: back the whole folder up somewhere private (a password
manager or an encrypted drive), and never commit or share it.

With Google Play App Signing (the default for new apps) Google keeps the key that signs what people install, and this key only
proves that an upload comes from you. If it is ever lost, Google Play support can register a new upload key, so it is not the
end of the app. Android installs on devices are signed by Google's key, not by this one.
#>
param([string]$Directory = (Join-Path $env:USERPROFILE '.plax-signing'))
$ErrorActionPreference = 'Stop'

$store = Join-Path $Directory 'plax-upload.jks'
$properties = Join-Path $Directory 'upload.properties'
if ((Test-Path -LiteralPath $store) -or (Test-Path -LiteralPath $properties)) {
    throw "A key already exists in $Directory. This script never replaces one."
}
if (-not $env:JAVA_HOME) { throw 'Set JAVA_HOME to a JDK (21 is used here).' }
$keytool = Join-Path $env:JAVA_HOME 'bin\keytool.exe'
if (-not (Test-Path -LiteralPath $keytool)) { throw "keytool was not found at $keytool." }

New-Item -ItemType Directory -Path $Directory -Force | Out-Null
# Only this account can open the folder.
$me = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $Directory /inheritance:r /grant:r "${me}:(OI)(CI)F" | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not restrict the key folder to this account.' }

$alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
$password = -join (1..32 | ForEach-Object { $alphabet[[System.Security.Cryptography.RandomNumberGenerator]::GetInt32($alphabet.Length)] })
$alias = 'plax-upload'

# keytool reads the passwords from the environment, so they are never on a command line.
$env:PLAX_KEY_PASSWORD = $password
try {
    & $keytool -genkeypair -keystore $store -storetype PKCS12 -alias $alias -keyalg RSA -keysize 4096 -validity 10950 `
        -dname 'CN=Plax Labs, O=Plax Labs, C=IN' -storepass:env PLAX_KEY_PASSWORD -keypass:env PLAX_KEY_PASSWORD 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $store)) { throw 'keytool could not make the key.' }
    # Gradle's properties files read a backslash as an escape, so the path is written with slashes.
    $text = "storeFile=$($store -replace '\\', '/')`nstorePassword=$password`nkeyAlias=$alias`nkeyPassword=$password`n"
    [System.IO.File]::WriteAllText($properties, $text, [System.Text.UTF8Encoding]::new($false))
    $listing = & $keytool -list -v -keystore $store -alias $alias -storepass:env PLAX_KEY_PASSWORD 2>&1
} finally {
    Remove-Item Env:PLAX_KEY_PASSWORD -ErrorAction SilentlyContinue
}

$sha1 = ($listing | Select-String -Pattern 'SHA1:\s*(\S+)').Matches[0].Groups[1].Value
$sha256 = ($listing | Select-String -Pattern 'SHA256:\s*(\S+)').Matches[0].Groups[1].Value
Write-Output "Made the Plax upload key."
Write-Output "  Key store : $store"
Write-Output "  Properties: $properties   (the build reads this; set PLAX_UPLOAD_PROPERTIES if you keep it elsewhere)"
Write-Output "  SHA-256   : $sha256"
Write-Output "  SHA-1     : $sha1"
Write-Output 'Back up the whole folder somewhere private now. Never commit it.'

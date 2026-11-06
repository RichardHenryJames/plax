#requires -Version 7.4
<#
Publishes the app's JavaScript over the air (EAS Update), after the checks that must pass before anyone's phone runs it: the native layer is
the one the runtime version promises, the code type-checks, and every unit test passes. It builds nothing and changes no file.

  .\scripts\publish-ota.ps1 -Message "Fix the share button"          # to every installed app of this runtime version (the production channel)
  .\scripts\publish-ota.ps1 -Message "..." -Rollout 10               # to 10 % of them first; publish again at 100 when it looks right
  .\scripts\publish-ota.ps1 -Message "..." -Branch e2e               # to the device tests' build only

Needs `eas login` as the project's owner. Only JavaScript and assets can go this way: a change to the native layer (a native package, the
manifest, a permission, a config plugin, modules\) makes the first check fail, and needs RUNTIME_VERSION bumped and a new bundle (README.md).
#>
param(
    [Parameter(Mandatory)][string]$Message,
    [ValidateSet('production', 'e2e')][string]$Branch = 'production',
    [ValidateRange(1, 100)][int]$Rollout = 100
)
$ErrorActionPreference = 'Stop'
$mobile = Split-Path $PSScriptRoot -Parent

function Step([string]$Name, [scriptblock]$Run) {
    Write-Output "== $Name"
    & $Run
    if ($LASTEXITCODE -ne 0) { throw "$Name failed (exit code $LASTEXITCODE). Nothing was published." }
}

Push-Location $mobile
try {
    Step 'The native layer is what the runtime version promises' { node scripts/native-fingerprint.js }
    Step 'Type check' { npx tsc --noEmit }
    Step 'Unit tests' { npx jest --silent }
    Step 'Signed in to Expo' { npx eas whoami }
    Step "Publish to the $Branch channel ($Rollout %)" {
        npx eas update --branch $Branch --message $Message --platform android --rollout-percentage $Rollout --non-interactive
    }
    Write-Output "Published. Check it with: npx eas update:list --branch $Branch"
}
finally {
    Pop-Location
}

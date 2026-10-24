param(
    [switch]$IncludeOffline,
    [int]$RepeatedLaunches = 5
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$packageName = 'com.axiomproductivity.twa.diagnostic'
$launcher = "$packageName/.LauncherActivity"
$androidSdk = if ($env:ANDROID_HOME) {
    $env:ANDROID_HOME
} elseif ($env:ANDROID_SDK_ROOT) {
    $env:ANDROID_SDK_ROOT
} else {
    'C:\Android\Sdk'
}
$adb = Join-Path $androidSdk 'platform-tools\adb.exe'

if (-not (Test-Path -LiteralPath $adb)) {
    throw "adb was not found at $adb"
}
if ((& $adb shell getprop ro.kernel.qemu).Trim() -ne '1') {
    throw 'This lifecycle regression script is intentionally restricted to an Android emulator.'
}

$resolvedLauncher = (& $adb shell cmd package resolve-activity --brief `
    -a android.intent.action.MAIN `
    -c android.intent.category.LAUNCHER `
    $packageName | Select-Object -Last 1).Trim()
if ($resolvedLauncher -ne $launcher) {
    throw "Unexpected launcher activity: $resolvedLauncher"
}

function Assert-TwaVisible([string]$scenario) {
    Start-Sleep -Seconds 4
    $top = (& $adb shell dumpsys activity activities |
        Select-String -Pattern 'topResumedActivity=' |
        Select-Object -First 1).Line
    if (-not $top -or ($top -notmatch [regex]::Escape($packageName) -and $top -notmatch 'com\.android\.chrome')) {
        throw "$scenario did not leave an Axiom/Chrome TWA activity visible. Top activity: $top"
    }
    Write-Output "$scenario passed: $($top.Trim())"
}

function Start-Axiom([string]$scenario) {
    & $adb shell am start -W `
        -a android.intent.action.MAIN `
        -c android.intent.category.LAUNCHER `
        -n $launcher | Out-Null
    Assert-TwaVisible $scenario
}

& $adb logcat -c
& $adb shell am force-stop $packageName
& $adb shell am force-stop com.android.chrome
Start-Axiom 'cold app / cold Chrome'

for ($index = 1; $index -le $RepeatedLaunches; $index++) {
    Start-Axiom "repeated launch $index"
}

& $adb shell input keyevent 3
Start-Axiom 'Home re-entry'
& $adb shell input keyevent 187
Start-Sleep -Seconds 1
Start-Axiom 'Recents re-entry'

& $adb shell am force-stop $packageName
Start-Axiom 'force-stop recovery'
& $adb shell am force-stop com.android.chrome
Start-Axiom 'Chrome process recovery'

if ($IncludeOffline) {
    try {
        & $adb shell cmd connectivity airplane-mode enable | Out-Null
        Start-Sleep -Seconds 2
        & $adb shell am force-stop $packageName
        & $adb shell am force-stop com.android.chrome
        Start-Axiom 'offline cold start'
    } finally {
        & $adb shell cmd connectivity airplane-mode disable | Out-Null
    }
    Start-Sleep -Seconds 3
    & $adb shell am force-stop $packageName
    & $adb shell am force-stop com.android.chrome
    Start-Axiom 'reconnect cold start'
}

$events = & $adb logcat -d -v brief ActivityTaskManager:W AndroidRuntime:E '*:S'
$failures = @(
    $events | Select-String -Pattern `
        'FATAL EXCEPTION',
        'TaskVanish',
        'Force finishing.*com\.axiomproductivity',
        'top resumed state loss timeout.*com\.axiomproductivity',
        'Activity pause timeout.*com\.axiomproductivity'
)
if ($failures.Count -gt 0) {
    $failures | ForEach-Object { Write-Error $_.Line }
    throw 'Axiom launcher/task lifecycle failures were found in logcat.'
}

Write-Output 'Android TWA launcher lifecycle regression checks passed.'

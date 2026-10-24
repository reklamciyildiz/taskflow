param(
    [switch]$PromptForSeparateKeyPassword,
    [switch]$PasswordFromStandardInput,
    [switch]$CandidateOnly,
    [string]$CandidateOutput
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$expectedPackage = 'com.axiomproductivity.twa.diagnostic'
$expectedCertificate = '84AADFBFCF2BF320DDC89D53E00E4D786DA09BD822F740A31609DFBC8E383CA8'
$minimumVersionCode = 2
$keyAlias = 'axiom_twa_diagnostic'

$repoRoot = Split-Path -Parent $PSScriptRoot
$projectRoot = Join-Path $repoRoot 'twa-diagnostic\project'
$keystore = Join-Path $projectRoot 'android.keystore'
$baselineApk = Join-Path $repoRoot 'twa-diagnostic\axiom-twa-production-beta.apk'
$unsignedApk = Join-Path $projectRoot 'app\build\outputs\apk\release\app-release-unsigned.apk'
$distDir = Join-Path $repoRoot 'dist\android'
$targetApk = Join-Path $distDir 'Axiom.apk'
$candidateApk = if ($CandidateOutput) {
    [IO.Path]::GetFullPath($CandidateOutput, $repoRoot)
} else {
    Join-Path $distDir 'Axiom-v1.0.4-test.apk'
}

if (-not (Test-Path -LiteralPath $keystore)) {
    throw 'The original Android signing keystore is missing. Refusing to create a replacement key.'
}
if (-not (Test-Path -LiteralPath $baselineApk)) {
    throw 'The signed baseline beta APK is missing; update compatibility cannot be verified.'
}

$androidSdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } elseif ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { 'C:\Android\Sdk' }
$buildToolsRoot = Join-Path $androidSdk 'build-tools'
$buildTools = Get-ChildItem -LiteralPath $buildToolsRoot -Directory | Sort-Object Name -Descending | Select-Object -First 1
if (-not $buildTools) { throw "Android build-tools were not found under $buildToolsRoot" }
$aapt = Join-Path $buildTools.FullName 'aapt.exe'
$zipalign = Join-Path $buildTools.FullName 'zipalign.exe'
$apksigner = Join-Path $buildTools.FullName 'apksigner.bat'
$apksignerJar = Join-Path $buildTools.FullName 'lib\apksigner.jar'
$java = (Get-Command java.exe -ErrorAction Stop).Source
foreach ($tool in @($aapt, $zipalign, $apksigner, $apksignerJar, $java)) {
    if (-not (Test-Path -LiteralPath $tool)) { throw "Required Android tool is missing: $tool" }
}

function Read-ApkIdentity([string]$apkPath) {
    $badgingOutput = @(& $aapt dump badging $apkPath)
    $badging = $badgingOutput | Select-Object -First 1
    if ($badging -notmatch "package: name='([^']+)' versionCode='([0-9]+)' versionName='([^']+)'") {
        throw "Unable to read APK identity: $apkPath"
    }
    return [pscustomobject]@{ Package = $Matches[1]; VersionCode = [int64]$Matches[2]; VersionName = $Matches[3] }
}

function Read-ApkCertificate([string]$apkPath) {
    $certificateOutput = (& $apksigner verify --print-certs $apkPath 2>&1)
    if ($LASTEXITCODE -ne 0) { throw "APK signature verification failed: $apkPath" }
    $digestLine = $certificateOutput | Where-Object { $_ -match 'certificate SHA-256 digest:\s*([0-9a-fA-F]+)' } | Select-Object -First 1
    if (-not $digestLine -or $digestLine -notmatch 'certificate SHA-256 digest:\s*([0-9a-fA-F]+)') {
        throw "Unable to read APK signing certificate: $apkPath"
    }
    return $Matches[1].ToUpperInvariant()
}

$baselineIdentity = Read-ApkIdentity $baselineApk
$baselineCertificate = Read-ApkCertificate $baselineApk
if ($baselineIdentity.Package -ne $expectedPackage -or $baselineCertificate -ne $expectedCertificate) {
    throw 'The baseline APK identity does not match the approved Axiom beta identity.'
}

$gradleHome = Join-Path $repoRoot 'twa-diagnostic\.gradle-user-home'
$androidUserHome = Join-Path $repoRoot '.local-android-user'
$env:GRADLE_USER_HOME = $gradleHome
$env:ANDROID_USER_HOME = $androidUserHome
New-Item -ItemType Directory -Path $androidUserHome -Force | Out-Null
Push-Location $projectRoot
try {
    & '.\gradlew.bat' --no-daemon assembleRelease
    if ($LASTEXITCODE -ne 0) { throw 'Gradle release build failed.' }
} finally {
    Pop-Location
}
if (-not (Test-Path -LiteralPath $unsignedApk)) { throw 'Gradle did not produce the expected unsigned APK.' }

New-Item -ItemType Directory -Path $distDir -Force | Out-Null
$buildId = [Guid]::NewGuid().ToString('N')
$alignedApk = Join-Path $distDir ".Axiom-$buildId-aligned.apk"
$signedApk = Join-Path $distDir ".Axiom-$buildId-signed.apk"

try {
    & $zipalign -f -p 4 $unsignedApk $alignedApk
    if ($LASTEXITCODE -ne 0) { throw 'zipalign failed.' }

    if ($PasswordFromStandardInput) {
        $storeInput = [Console]::In.ReadLine()
        if ([string]::IsNullOrEmpty($storeInput)) { throw 'No keystore password was provided on standard input.' }
        $storePassword = ConvertTo-SecureString $storeInput -AsPlainText -Force
        $storeInput = $null
    } else {
        $storePassword = Read-Host 'Android keystore password (input is hidden)' -AsSecureString
    }
    $keyPassword = if ($PromptForSeparateKeyPassword) {
        if ($PasswordFromStandardInput) {
            $keyInput = [Console]::In.ReadLine()
            if ([string]::IsNullOrEmpty($keyInput)) { throw 'No key password was provided on standard input.' }
            $secureKeyInput = ConvertTo-SecureString $keyInput -AsPlainText -Force
            $keyInput = $null
            $secureKeyInput
        } else {
            Read-Host 'Android key password (input is hidden)' -AsSecureString
        }
    } else {
        $storePassword
    }
    $storePointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($storePassword)
    $keyPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($keyPassword)
    try {
        $storePlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($storePointer)
        $keyPlain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($keyPointer)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($storePointer)
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($keyPointer)
    }

    try {
        $arguments = @(
            '-jar', $apksignerJar, 'sign', '--ks', $keystore, '--ks-key-alias', $keyAlias,
            '--ks-pass', 'stdin', '--key-pass', 'stdin', '--out', $signedApk, $alignedApk
        )
        $processInfo = [Diagnostics.ProcessStartInfo]::new()
        $processInfo.FileName = $java
        $processInfo.Arguments = ($arguments | ForEach-Object { '"' + $_.Replace('"', '\"') + '"' }) -join ' '
        $processInfo.UseShellExecute = $false
        $processInfo.RedirectStandardInput = $true
        $processInfo.RedirectStandardOutput = $true
        $processInfo.RedirectStandardError = $true
        $process = [Diagnostics.Process]::Start($processInfo)
        $process.StandardInput.WriteLine($storePlain)
        $process.StandardInput.WriteLine($keyPlain)
        $process.StandardInput.Close()
        $stdout = $process.StandardOutput.ReadToEnd()
        $stderr = $process.StandardError.ReadToEnd()
        $process.WaitForExit()
        if ($process.ExitCode -ne 0) { throw "APK signing failed. $stderr" }
    } finally {
        $storePlain = $null
        $keyPlain = $null
        [GC]::Collect()
    }

    & $apksigner verify --verbose $signedApk | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'The signed APK failed apksigner verification.' }
    & $zipalign -c -p 4 $signedApk | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'The signed APK failed zipalign verification.' }

    $identity = Read-ApkIdentity $signedApk
    $certificate = Read-ApkCertificate $signedApk
    if ($identity.Package -ne $baselineIdentity.Package) { throw 'Application ID changed; refusing promotion.' }
    $currentIdentity = if (Test-Path -LiteralPath $targetApk) { Read-ApkIdentity $targetApk } else { $baselineIdentity }
    if ($identity.VersionCode -le $currentIdentity.VersionCode -or $identity.VersionCode -lt $minimumVersionCode) {
        throw 'versionCode is not greater than the installed beta version.'
    }
    if ($certificate -ne $baselineCertificate -or $certificate -ne $expectedCertificate) {
        throw 'Signing certificate changed; refusing promotion.'
    }

    $outputApk = if ($CandidateOnly) { $candidateApk } else { $targetApk }
    $outputDirectory = Split-Path -Parent $outputApk
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
    $backup = Join-Path $outputDirectory ('.' + [IO.Path]::GetFileName($outputApk) + '.previous')
    if (Test-Path -LiteralPath $outputApk) {
        [IO.File]::Replace($signedApk, $outputApk, $backup, $true)
        Remove-Item -LiteralPath $backup -Force
    } else {
        Move-Item -LiteralPath $signedApk -Destination $outputApk
    }
    $hash = (Get-FileHash -LiteralPath $outputApk -Algorithm SHA256).Hash
    Set-Content -LiteralPath ($outputApk + '.sha256') -Value "$hash  $([IO.Path]::GetFileName($outputApk))" -Encoding ascii
    Write-Output "Axiom Android beta is ready: $outputApk"
    Write-Output "Package=$($identity.Package) VersionCode=$($identity.VersionCode) VersionName=$($identity.VersionName)"
    Write-Output "CertificateSHA256=$certificate"
} finally {
    foreach ($temporary in @($alignedApk, "$alignedApk.idsig", $signedApk, "$signedApk.idsig")) {
        if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary -Force }
    }
}

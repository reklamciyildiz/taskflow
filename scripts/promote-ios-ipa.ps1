param(
    [Parameter(Mandatory = $true)]
    [string]$ArtifactZip
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$distDir = Join-Path $repoRoot 'dist\ios'
$temporaryRoot = Join-Path $distDir (".work-" + [Guid]::NewGuid().ToString('N'))
$extractRoot = Join-Path $temporaryRoot 'content'

try {
    New-Item -ItemType Directory -Path $distDir -Force | Out-Null
    New-Item -ItemType Directory -Path $extractRoot -Force | Out-Null
    Expand-Archive -LiteralPath $ArtifactZip -DestinationPath $extractRoot
    $ipas = @(Get-ChildItem -LiteralPath $extractRoot -Filter '*.ipa' -File -Recurse)
    if ($ipas.Count -ne 1) { throw "Expected exactly one IPA in the artifact; found $($ipas.Count)." }

    $target = Join-Path $distDir 'Axiom-unsigned.ipa'
    $staged = Join-Path $distDir ('.Axiom-' + [Guid]::NewGuid().ToString('N') + '.ipa')
    Copy-Item -LiteralPath $ipas[0].FullName -Destination $staged
    if ((Get-Item -LiteralPath $staged).Length -le 0) { throw 'The staged IPA is empty.' }

    $backup = Join-Path $distDir '.Axiom.previous.ipa'
    if (Test-Path -LiteralPath $target) {
        [IO.File]::Replace($staged, $target, $backup, $true)
        Remove-Item -LiteralPath $backup -Force
    } else {
        Move-Item -LiteralPath $staged -Destination $target
    }
    $hash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
    Set-Content -LiteralPath (Join-Path $distDir 'Axiom-unsigned.ipa.sha256') -Value "$hash  Axiom-unsigned.ipa" -Encoding ascii
    Write-Output "Axiom unsigned iOS IPA is ready: $target"
} finally {
    if (Test-Path -LiteralPath $temporaryRoot) { Remove-Item -LiteralPath $temporaryRoot -Recurse -Force }
}

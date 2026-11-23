param(
    [string]$Runtime = 'C:\Program Files\nodejs\node.exe',
    [string]$RuntimeLicense,
    [string]$PackageName = 'FatBurnHero-v0.1-Windows-x64-20261123'
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $RuntimeLicense) { $RuntimeLicense = Join-Path $projectRoot 'release/runtime-cache/NODE-LICENSE.txt' }
if ($PackageName -notmatch '^[A-Za-z0-9._-]+$') { throw 'PackageName must be a simple directory name.' }
$packageRoot = Join-Path $projectRoot ('release/' + $PackageName)
if (Test-Path -LiteralPath $packageRoot) { throw 'Package directory exists. Choose a new PackageName.' }
if (-not (Test-Path -LiteralPath $RuntimeLicense)) { throw 'Provide the matching Node.js LICENSE file.' }
Push-Location (Join-Path $projectRoot 'web')
try {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
} finally { Pop-Location }
New-Item -ItemType Directory -Path (Join-Path $packageRoot 'runtime') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot 'web/dist') -Destination $packageRoot -Recurse
Copy-Item -LiteralPath (Join-Path $projectRoot 'web/server.mjs'),(Join-Path $projectRoot 'web/llm-proxy.mjs') -Destination $packageRoot
Copy-Item -LiteralPath $Runtime -Destination (Join-Path $packageRoot 'runtime/node.exe')
Copy-Item -LiteralPath $RuntimeLicense -Destination (Join-Path $packageRoot 'runtime/NODE-LICENSE.txt')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'portable-launcher.mjs') -Destination (Join-Path $packageRoot 'launch.mjs')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'portable-start.cmd') -Destination (Join-Path $packageRoot '启动测试.cmd')
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'PORTABLE_README.txt') -Destination (Join-Path $packageRoot '使用说明.txt')
$notices = foreach ($dependency in @('react','react-dom','scheduler')) {
    $licensePath = Join-Path $projectRoot ('web/node_modules/' + $dependency + '/LICENSE')
    $dependency
    Get-Content -LiteralPath $licensePath -Raw
}
Set-Content -LiteralPath (Join-Path $packageRoot 'THIRD_PARTY_NOTICES.txt') -Value $notices -Encoding utf8
$runtimeVersion = & $Runtime -p 'process.version'
$sourceBundle = (Get-ChildItem (Join-Path $packageRoot 'dist/assets') -Filter '*.js').Name
@{
    product = 'Fat Burn Hero'
    version = '0.1.0'
    platform = 'win32-x64'
    runtime = $runtimeVersion
    bundle = $sourceBundle
    url = 'http://127.0.0.1:18080/'
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $packageRoot 'BUILD_INFO.json') -Encoding utf8
$checksums = Get-ChildItem -LiteralPath $packageRoot -File -Recurse | ForEach-Object {
    $relativePath = $_.FullName.Substring($packageRoot.Length + 1).Replace('\', '/')
    (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLower() + '  ' + $relativePath
}
Set-Content -LiteralPath (Join-Path $packageRoot 'SHA256SUMS.txt') -Value $checksums -Encoding utf8
$archive = $packageRoot + '.zip'
Compress-Archive -LiteralPath $packageRoot -DestinationPath $archive -CompressionLevel Optimal
Get-FileHash -LiteralPath $archive -Algorithm SHA256 | ForEach-Object {
    $_.Hash.ToLower() + '  ' + (Split-Path -Leaf $archive)
} | Set-Content -LiteralPath ($archive + '.sha256.txt') -Encoding utf8
Get-Item -LiteralPath $archive | Select-Object FullName,Length

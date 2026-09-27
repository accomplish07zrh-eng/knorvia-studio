param(
  [Parameter(Mandatory = $true)][string]$DistPath,
  [Parameter(Mandatory = $true)][string]$OutputDirectory,
  [Parameter(Mandatory = $true)][ValidatePattern('^[0-9a-f]{40}$')][string]$DeliveredSha
)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$version = (Get-Content -LiteralPath (Join-Path $repoRoot 'package.json') -Raw | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$') { throw 'Invalid release version' }
$currentSha = (git -C $repoRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $currentSha -ne $DeliveredSha) { throw 'Release SHA differs from current checkout' }
$distRoot = (Resolve-Path -LiteralPath $DistPath).Path
$unpacked = Join-Path $distRoot 'win-unpacked'
$sourceInstaller = Join-Path $distRoot "Knorvia Studio-$version-win-x64.exe"
foreach ($required in @($sourceInstaller, (Join-Path $unpacked 'Knorvia Studio.exe'), (Join-Path $unpacked 'resources/app.asar'))) {
  if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw "Missing build artifact: $required" }
}
# 安装包来源必须保持普通用户目录身份；便携标记只能加入独立 staging。
if (Test-Path -LiteralPath (Join-Path $unpacked 'resources/knorvia-portable.json')) { throw 'Installer source contains a portable marker' }
if (Test-Path -LiteralPath (Join-Path $unpacked 'data')) { throw 'Build contains user data' }
$outputRoot = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $outputRoot) { throw 'Use a fresh release output directory; artifacts must never be overwritten' }
New-Item -ItemType Directory -Path $outputRoot | Out-Null
$stage = Join-Path $outputRoot '.portable-stage/Knorvia Studio Portable'
New-Item -ItemType Directory -Path $stage -Force | Out-Null
Get-ChildItem -LiteralPath $unpacked -Force | Copy-Item -Destination $stage -Recurse -Force
$marker = [ordered]@{ product = 'Knorvia Studio'; version = 1; dataDirectory = 'data' } | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $stage 'resources/knorvia-portable.json'), "$marker`n", [Text.UTF8Encoding]::new($false))
$installerName = "Knorvia-Studio-$version-win-x64-setup.exe"
$portableName = "Knorvia-Studio-$version-win-x64-portable.zip"
Copy-Item -LiteralPath $sourceInstaller -Destination (Join-Path $outputRoot $installerName)
Compress-Archive -LiteralPath $stage -DestinationPath (Join-Path $outputRoot $portableName) -CompressionLevel Optimal
$artifacts = @()
foreach ($name in @($installerName, $portableName)) {
  $path = Join-Path $outputRoot $name
  $sha = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
  $checksum = "$path.sha256"
  [IO.File]::WriteAllText($checksum, "$sha  $name`n", [Text.Encoding]::ASCII)
  $artifacts += [ordered]@{ name = $name; sha256 = $sha }
  $artifacts += [ordered]@{ name = "$name.sha256"; sha256 = (Get-FileHash -LiteralPath $checksum -Algorithm SHA256).Hash.ToLowerInvariant() }
}
[IO.File]::WriteAllText((Join-Path $outputRoot 'release-artifacts.json'), ($artifacts | ConvertTo-Json) + "`n", [Text.UTF8Encoding]::new($false))
[ordered]@{ version = $version; deliveredSha = $DeliveredSha; outputDirectory = $outputRoot; portableDirectory = $stage; artifacts = $artifacts } | ConvertTo-Json -Depth 4

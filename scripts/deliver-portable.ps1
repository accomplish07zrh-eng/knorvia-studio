param(
  [Parameter(Mandatory = $true)][string]$Source,
  [Parameter(Mandatory = $true)][string]$Target
)

$ErrorActionPreference = 'Stop'
$sourceRoot = (Resolve-Path -LiteralPath $Source).Path.TrimEnd('\')
$targetRoot = (Resolve-Path -LiteralPath $Target).Path.TrimEnd('\')
if (-not (Test-Path -LiteralPath $sourceRoot -PathType Container) -or
    -not (Test-Path -LiteralPath $targetRoot -PathType Container) -or
    $sourceRoot.Equals($targetRoot, [StringComparison]::OrdinalIgnoreCase) -or
    $sourceRoot.StartsWith($targetRoot + '\', [StringComparison]::OrdinalIgnoreCase) -or
    $targetRoot.StartsWith($sourceRoot + '\', [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Source and target must be separate existing directories.'
}

$sourceExe = Join-Path $sourceRoot 'Knorvia Studio.exe'
$targetExe = Join-Path $targetRoot 'Knorvia Studio.exe'
$markerPath = Join-Path $targetRoot 'resources\knorvia-portable.json'
if (-not (Test-Path -LiteralPath $sourceExe -PathType Leaf)) { throw "Missing source executable: $sourceExe" }
if (-not (Test-Path -LiteralPath $markerPath -PathType Leaf)) { throw "Missing portable marker: $markerPath" }
$marker = Get-Content -LiteralPath $markerPath -Raw | ConvertFrom-Json
if ($marker.product -ne 'Knorvia Studio' -or $marker.dataDirectory -ne 'data') {
  throw 'Portable marker does not declare the expected product and data directory.'
}

$running = @(Get-CimInstance Win32_Process | Where-Object {
  $_.ExecutablePath -and $_.ExecutablePath.Equals($targetExe, [StringComparison]::OrdinalIgnoreCase)
})
if ($running.Count -gt 0) { throw "Portable app is running (PID $($running.ProcessId -join ', '))." }

$dataRoot = Join-Path $targetRoot 'data'
if (-not (Test-Path -LiteralPath $dataRoot -PathType Container)) { throw "Missing portable data: $dataRoot" }
$reparse = @(Get-ChildItem -LiteralPath $dataRoot -Recurse -Force -Attributes ReparsePoint)
if ($reparse.Count -gt 0) { throw 'Portable data contains a junction or symlink; refusing an incomplete hash comparison.' }

# 相对路径在遍历时由目录名逐级拼接得到，**不使用字符串长度截取**。
# 调用方可能给 8.3 短名（CI 上 %TEMP% 常是 C:\Users\RUNNER~1\...），而 Get-ChildItem 返回的
# FullName 可能是长名；两者长度不同，`FullName.Substring($Root.Length + 1)` 会算错相对路径
# （历史上 Windows CI 因此报出 `ld\Knorvia Studio.exe` 这种被截断的名字）。
function Get-RelativeFileManifest {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [switch]$ExcludeTopLevelData
  )
  $result = New-Object System.Collections.Generic.List[object]
  $pending = New-Object System.Collections.Stack
  $pending.Push([pscustomobject]@{ Path = $Root; Relative = '' })
  while ($pending.Count -gt 0) {
    $current = $pending.Pop()
    foreach ($entry in @(Get-ChildItem -LiteralPath $current.Path -Force)) {
      $relative = if ($current.Relative) { Join-Path $current.Relative $entry.Name } else { $entry.Name }
      if ($entry.PSIsContainer) {
        if ($ExcludeTopLevelData -and -not $current.Relative -and $entry.Name -ieq 'data') { continue }
        $pending.Push([pscustomobject]@{ Path = $entry.FullName; Relative = $relative })
        continue
      }
      $result.Add([pscustomobject]@{
        RelativePath = $relative
        FullName = $entry.FullName
        Bytes = $entry.Length
        Sha256 = (Get-FileHash -LiteralPath $entry.FullName -Algorithm SHA256).Hash
      })
    }
  }
  return @($result | Sort-Object RelativePath)
}

$before = @(Get-RelativeFileManifest -Root $dataRoot)
$beforeBytes = [long](($before | Measure-Object -Property Bytes -Sum).Sum)
Write-Output "Portable data before: $($before.Count) files, $beforeBytes bytes"

# /E copies program files without deleting target-only files. Both data paths are excluded.
& robocopy.exe $sourceRoot $targetRoot /E /R:2 /W:1 /XD (Join-Path $sourceRoot 'data') $dataRoot /NFL /NDL /NJH /NJS /NP
$copyCode = $LASTEXITCODE
if ($copyCode -ge 8) { throw "Robocopy failed with code $copyCode" }

$after = @(Get-RelativeFileManifest -Root $dataRoot)
$difference = @(Compare-Object -ReferenceObject $before -DifferenceObject $after -Property RelativePath, Bytes, Sha256)
if ($difference.Count -gt 0) { throw "Portable data hash mismatch after copy ($($difference.Count) differences). STOP." }
if (-not (Test-Path -LiteralPath $markerPath -PathType Leaf)) { throw 'Portable marker disappeared after copy.' }
$deliveredMarker = Get-Content -LiteralPath $markerPath -Raw | ConvertFrom-Json
if ($deliveredMarker.product -ne 'Knorvia Studio' -or $deliveredMarker.dataDirectory -ne 'data') {
  throw 'Portable marker changed during delivery.'
}
$sourceFiles = @(Get-RelativeFileManifest -Root $sourceRoot -ExcludeTopLevelData)
foreach ($file in $sourceFiles) {
  $deliveredPath = Join-Path $targetRoot $file.RelativePath
  if (-not (Test-Path -LiteralPath $deliveredPath -PathType Leaf)) {
    # 失败时给出双方完整路径与根，便于区分「找错目标文件」和「内容确实不同」。
    throw @"
Delivered program file is missing: $($file.RelativePath)
  source root  : $sourceRoot
  target root  : $targetRoot
  source file  : $($file.FullName)
  expected at  : $deliveredPath
"@
  }
  $deliveredHash = (Get-FileHash -LiteralPath $deliveredPath -Algorithm SHA256).Hash
  if ($deliveredHash -ne $file.Sha256) {
    throw @"
Delivered program file differs from build: $($file.RelativePath)
  source root  : $sourceRoot
  target root  : $targetRoot
  source file  : $($file.FullName) [$($file.Sha256)]
  delivered    : $deliveredPath [$deliveredHash]
"@
  }
}
$sourceHash = (Get-FileHash -LiteralPath $sourceExe -Algorithm SHA256).Hash
$targetHash = (Get-FileHash -LiteralPath $targetExe -Algorithm SHA256).Hash
if ($sourceHash -ne $targetHash) { throw 'Delivered executable does not match the built executable.' }
$version = (Get-Content -LiteralPath (Join-Path (Split-Path $PSScriptRoot -Parent) 'package.json') -Raw | ConvertFrom-Json).version
$verification = [ordered]@{
  target = $targetRoot
  product = 'Knorvia Studio'
  version = $version
  dataFiles = $after.Count
  dataDirectories = @(Get-ChildItem -LiteralPath $dataRoot -Recurse -Directory -Force).Count
  dataBytes = $beforeBytes
  dataUnchanged = $true
  programFilesVerified = $sourceFiles.Count
  exeSha256 = $targetHash
  asarSha256 = (Get-FileHash -LiteralPath (Join-Path $targetRoot 'resources\app.asar') -Algorithm SHA256).Hash
  verifiedAt = [DateTimeOffset]::UtcNow.ToString('o')
}
$verification | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $targetRoot '构建校验.json') -Encoding utf8
Write-Output "Portable data verified: $($after.Count) files, $beforeBytes bytes, SHA-256 identical; robocopy code $copyCode"
Write-Output "Program files verified: $($sourceFiles.Count) SHA-256 identical to the build"
Write-Output "Delivered executable SHA-256: $targetHash"

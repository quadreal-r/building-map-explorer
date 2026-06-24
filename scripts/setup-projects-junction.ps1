# Creates C:\Users\Robert\Projects\building-map-explorer → OneDrive project junction.
# Close Cursor (and any terminals in the old path) before running.

$ErrorActionPreference = 'Stop'

$link = 'C:\Users\Robert\Projects\building-map-explorer'
$target = 'C:\Users\Robert\OneDrive - Quadreal Property Group\#OI-Industrial East - @Master Sheets&Projects\Claude Projects\Cursor Projects\building-map-explorer'
$stubArchive = 'C:\Users\Robert\Projects\_building-map-explorer.stub'

if (-not (Test-Path -LiteralPath $target)) {
  Write-Error "Target not found: $target"
}

if (Test-Path -LiteralPath $link) {
  $item = Get-Item -LiteralPath $link -Force
  if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
    Write-Host "Junction already exists at $link"
    cmd /c dir $link | Select-Object -First 5
    exit 0
  }

  Write-Host "Removing leftover stub at $link ..."
  if (Test-Path -LiteralPath $stubArchive) {
    Remove-Item -LiteralPath $stubArchive -Recurse -Force
  }
  Rename-Item -LiteralPath $link -NewName (Split-Path -Leaf $stubArchive) -Force
  Remove-Item -LiteralPath $stubArchive -Recurse -Force
}

Write-Host "Creating junction..."
cmd /c mklink /J "$link" "$target"
Write-Host "Done. Open the project from:"
Write-Host "  $link"

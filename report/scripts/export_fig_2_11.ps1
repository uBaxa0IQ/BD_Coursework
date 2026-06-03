# Export figure 2.11 (architecture component diagram) to img/fig_2_11.pdf + .png
$ErrorActionPreference = "Stop"

$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$reportDir = Join-Path $root "report"
$imgDir = Join-Path $root "img"
$outBase = Join-Path $imgDir "fig_2_11"
$uncroppedPdf = Join-Path $reportDir "fig_2_11_export.pdf"
$cropScript = Join-Path $reportDir "scripts\crop_diagram_margins.py"

$pdflatex = Get-Command pdflatex -ErrorAction SilentlyContinue
if (-not $pdflatex) {
    $candidates = @(
        "$env:LOCALAPPDATA\Programs\MiKTeX\miktex\bin\x64\pdflatex.exe",
        "D:\tex\miktex\bin\x64\pdflatex.exe",
        "C:\Program Files\MiKTeX\miktex\bin\x64\pdflatex.exe"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { $pdflatex = @{ Source = $c }; break }
    }
}
if (-not $pdflatex) {
    throw "pdflatex not found. Install MiKTeX or add pdflatex to PATH."
}
$pdflatexExe = if ($pdflatex.Source) { $pdflatex.Source } else { $pdflatex.Path }

Push-Location $reportDir
try {
    & $pdflatexExe -interaction=nonstopmode -halt-on-error "fig_2_11_export.tex" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "pdflatex failed with exit code $LASTEXITCODE"
    }
    if (-not (Test-Path $uncroppedPdf)) {
        throw "Expected PDF not found: $uncroppedPdf"
    }

    New-Item -ItemType Directory -Force -Path $imgDir | Out-Null

    $outPdf = "$outBase.pdf"
    Copy-Item -Path $uncroppedPdf -Destination $outPdf -Force

    python $cropScript -i $outPdf -o $outBase --dpi 600 --png-only
    if ($LASTEXITCODE -ne 0) {
        throw "crop_diagram_margins.py failed"
    }

    Write-Host "Done:"
    Write-Host "  $outPdf  (vector PDF, use in presentation)"
    Write-Host "  $($outBase).png  (600 dpi raster, optional)"
}
finally {
    Pop-Location
}

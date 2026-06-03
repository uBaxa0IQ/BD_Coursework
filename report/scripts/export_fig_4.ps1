# Export figures 4.1--4.3 (research_part charts) to img/fig_4_*.pdf + .png
$ErrorActionPreference = "Stop"

$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$reportDir = Join-Path $root "report"
$imgDir = Join-Path $root "img"
$cropScript = Join-Path $reportDir "scripts\crop_diagram_margins.py"

$figures = @("fig_4_1", "fig_4_2", "fig_4_3")

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
    New-Item -ItemType Directory -Force -Path $imgDir | Out-Null

    foreach ($fig in $figures) {
        $tex = "${fig}_export.tex"
        $uncroppedPdf = Join-Path $reportDir "${fig}_export.pdf"
        $outBase = Join-Path $imgDir $fig
        $outPdf = "$outBase.pdf"

        Write-Host "Building $tex ..."
        & $pdflatexExe -interaction=nonstopmode -halt-on-error $tex | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "pdflatex failed for $tex (exit $LASTEXITCODE)"
        }
        if (-not (Test-Path $uncroppedPdf)) {
            throw "Expected PDF not found: $uncroppedPdf"
        }

        Copy-Item -Path $uncroppedPdf -Destination $outPdf -Force
        python $cropScript -i $outPdf -o $outBase --dpi 600 --png-only
        if ($LASTEXITCODE -ne 0) {
            throw "crop_diagram_margins.py failed for $fig"
        }

        Write-Host "  $outPdf"
        Write-Host "  $($outBase).png"
    }

    Write-Host "Done: fig_4_1, fig_4_2, fig_4_3"
}
finally {
    Pop-Location
}

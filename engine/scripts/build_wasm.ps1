param(
    [string]$Output = (Join-Path $PSScriptRoot "..\dist")
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$include = Join-Path $root "include"
$binding = Join-Path $root "bindings\wasm.cpp"
$outDir = (New-Item -ItemType Directory -Force -Path $Output).FullName
$outJs = Join-Path $outDir "rift_engine.js"

$exported = @(
    "_rift_create",
    "_rift_reset",
    "_rift_destroy",
    "_rift_input",
    "_rift_output",
    "_rift_bars",
    "_rift_bars_count",
    "_rift_process"
) -join ","

$runtime = @("cwrap", "getValue", "HEAPF64") -join ","

emcc $binding `
    -std=c++17 -O3 `
    -I $include `
    -s MODULARIZE=1 `
    -s EXPORT_ES6=1 `
    -s ENVIRONMENT=node,web `
    -s ALLOW_MEMORY_GROWTH=1 `
    -s "EXPORTED_FUNCTIONS=[$exported]" `
    -s "EXPORTED_RUNTIME_METHODS=[$runtime]" `
    -o $outJs

if ($LASTEXITCODE -ne 0) {
    throw "emcc build failed with exit code $LASTEXITCODE"
}

Write-Output "Built $outJs"

#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$script_dir/.." && pwd)"
include="$root/include"
binding="$root/bindings/wasm.cpp"
out_dir="${1:-$root/dist}"
mkdir -p "$out_dir"
out_js="$out_dir/rift_engine.js"

exported="_rift_create,_rift_reset,_rift_destroy,_rift_input,_rift_output,_rift_bars,_rift_bars_count,_rift_process"
runtime="cwrap,getValue,HEAPF64"

emcc "$binding" \
    -std=c++17 -O3 \
    -I "$include" \
    -s MODULARIZE=1 \
    -s EXPORT_ES6=1 \
    -s ENVIRONMENT=node,web \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s "EXPORTED_FUNCTIONS=[$exported]" \
    -s "EXPORTED_RUNTIME_METHODS=[$runtime]" \
    -o "$out_js"

echo "Built $out_js"

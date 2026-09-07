#!/usr/bin/env bash
# Local verification build. Google AI Studio does not need this — it runs
# index.tsx directly. This exists so the shell can be bundled and served
# from any static host.
set -euo pipefail
ESBUILD="${ESBUILD:-esbuild}"
"$ESBUILD" index.tsx \
  --bundle \
  --format=esm \
  --jsx=automatic \
  --target=es2022 \
  --loader:.tsx=tsx \
  --outfile=build/bundle.js \
  --log-level=warning
echo "built build/bundle.js"

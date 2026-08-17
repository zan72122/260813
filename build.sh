#!/usr/bin/env bash
# Builds the single-file index.html by inlining three.min.js and src/app.js
# into src/template.html. Run from the repo root:  ./build.sh
set -euo pipefail
cd "$(dirname "$0")"
python3 - <<'PY'
template = open('src/template.html', encoding='utf-8').read()
three = open('vendor/three.min.js', encoding='utf-8').read()
app = open('src/app.js', encoding='utf-8').read()
out = template.replace('/*THREE_JS*/', three).replace('/*APP_JS*/', app)
open('index.html', 'w', encoding='utf-8').write(out)
print('built index.html (%d bytes)' % len(out))
PY

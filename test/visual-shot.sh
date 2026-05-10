#!/bin/bash
# Visual test loop: take a headless screenshot of the highlight test page.
# Usage: ./visual-shot.sh [output_path]
set -e
OUT="${1:-/tmp/highlight-test/shot.png}"
mkdir -p "$(dirname "$OUT")"
mkdir -p /tmp/ff-profile
firefox --headless --no-remote --profile /tmp/ff-profile \
  --screenshot "$OUT" --window-size=800,700 \
  "http://localhost:3001/test-highlight.html" 2>/dev/null
echo "Screenshot: $OUT"

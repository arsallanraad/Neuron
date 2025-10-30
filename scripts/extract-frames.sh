#!/usr/bin/env bash
set -euo pipefail

# Usage: ./scripts/extract-frames.sh <VIDEO_URL> <OUTPUT_DIR> <FRAMES>
# Example:
# ./scripts/extract-frames.sh "https://.../compressed?apiKey=..." public/sequence 280

VIDEO_URL=${1:-}
OUT_DIR=${2:-public/sequence}
FRAMES=${3:-280}

if [ -z "$VIDEO_URL" ]; then
  echo "ERROR: VIDEO_URL is required as first argument"
  echo "Usage: $0 <VIDEO_URL> <OUTPUT_DIR> <FRAMES>"
  exit 1
fi

mkdir -p "$OUT_DIR"
TMP_VIDEO="$OUT_DIR/source.mp4"

echo "Downloading video to $TMP_VIDEO..."
curl -L "$VIDEO_URL" -o "$TMP_VIDEO" --retry 3 --silent --show-error

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ERROR: ffmpeg is required but not installed. Install ffmpeg and rerun."
  exit 2
fi

if ! command -v ffprobe >/dev/null 2>&1; then
  echo "ERROR: ffprobe is required but not installed. Install ffmpeg (which provides ffprobe) and rerun."
  exit 2
fi

# Get video duration in seconds (may be floating)
DURATION=$(ffprobe -v error -select_streams v:0 -show_entries stream=duration -of default=noprint_wrappers=1:nokey=1 "$TMP_VIDEO")
# Compute fps to extract approximately FRAMES frames evenly across duration
FPS=$(python3 - <<PY
import math,sys
try:
    d=float(sys.argv[1])
    f=int(sys.argv[2])
    if d<=0: raise
    print(max(0.1, f/d))
except Exception:
    print(25.0)
PY
"$DURATION" "$FRAMES")

echo "Video duration: $DURATION s, extracting ~$FRAMES frames at fps=$FPS"

# Remove previous frames
rm -f "$OUT_DIR/frame-"*.jpg || true

ffmpeg -y -i "$TMP_VIDEO" -vf fps=$FPS -qscale:v 2 "$OUT_DIR/frame-%03d.jpg"

COUNT=$(ls "$OUT_DIR"/frame-*.jpg | wc -l || true)
echo "Extracted $COUNT frames to $OUT_DIR"

echo "Done. Update your app to reference /sequence/frame-###.jpg and set FRAME_COUNT accordingly (or keep it larger; missing frames will be skipped)."

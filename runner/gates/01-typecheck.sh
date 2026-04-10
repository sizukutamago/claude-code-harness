#!/bin/bash
set -euo pipefail

if ! command -v npx > /dev/null 2>&1; then
  echo "npx: command not found" >&2
  exit 1
fi

npx tsc --noEmit

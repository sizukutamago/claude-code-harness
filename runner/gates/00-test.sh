#!/bin/bash
set -euo pipefail

if ! command -v npm > /dev/null 2>&1; then
  echo "npm: command not found" >&2
  exit 1
fi

npm test

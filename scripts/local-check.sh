#!/usr/bin/env bash
# Local replacement for .github/workflows/ci.yml (Actions permanently off, owner 2026-10-30).
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/validate-distro.cjs --full
echo "LOCAL CHECK: ALL GREEN"

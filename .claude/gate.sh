#!/usr/bin/env bash
# Fast gate: TypeScript typecheck. No deploys, no network writes.
set -euo pipefail
cd "$(dirname "$0")/.."
npx tsc --noEmit

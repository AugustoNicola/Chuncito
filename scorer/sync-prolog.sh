#!/usr/bin/env bash
# Re-vendor the Prolog scorer from the upstream Mahjonglog working tree.
# Gate: the upstream test suite must pass before the new copy is accepted.
set -euo pipefail

UPSTREAM="${1:-/home/lambda/develop/Mahjonglog}"
HERE="$(cd "$(dirname "$0")" && pwd)"
DEST="$HERE/mahjonglog"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

[ -d "$UPSTREAM/src" ] || { echo "no src/ at $UPSTREAM" >&2; exit 1; }

mkdir -p "$STAGE/src" "$STAGE/tests"
cp "$UPSTREAM"/src/*.pl   "$STAGE/src/"
cp "$UPSTREAM"/tests/*.pl "$STAGE/tests/"

echo "Running upstream test suite against the staged copy..."
if ! (cd "$STAGE" && swipl -g "consult('tests/tests'), run_tests, halt" -t 'halt(1)'); then
  echo "REFUSED: upstream tests fail; vendored copy left unchanged." >&2
  exit 1
fi

rm -rf "$DEST"; mkdir -p "$DEST"
cp -r "$STAGE/src" "$STAGE/tests" "$DEST/"

COMMIT="$(cd "$UPSTREAM" && git rev-parse HEAD 2>/dev/null || echo unknown)"
DIRTY=""; (cd "$UPSTREAM" && git diff-index --quiet HEAD -- 2>/dev/null) || DIRTY=" (+uncommitted changes)"
cat > "$HERE/VENDORED.md" <<META
# Vendored scorer

Source: \`$UPSTREAM\`
Upstream commit: \`$COMMIT\`$DIRTY
Vendored: $(date -Iseconds)
Gate: upstream test suite passed at vendor time.

Re-vendor with \`scorer/sync-prolog.sh\`. Do not edit \`mahjonglog/\` in place —
changes belong upstream.
META
echo "Vendored to $DEST"

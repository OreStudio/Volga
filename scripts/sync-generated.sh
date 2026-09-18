#!/usr/bin/env bash
# Copy the code generator's TypeScript output into this repository.
#
# The generator lives with the C++ sources and writes into its own project tree.
# This repository consumes it, so the output is copied in and committed: a
# checkout here builds without the C++ tree, and a change to the generated code
# shows up as a diff rather than as a mystery.
#
# Nothing in here is edited by hand. To change it, change the model or the
# template and regenerate, then run this again.
#
# Routing is by directory, because the two halves are consumed in different
# places:
#   <component>/ui/       the table and form declarations, used by the interface
#   <component>/protocol/ the message shapes, used by the protocol package
#   ui-contract.ts        the types both are checked against
#
# Usage:
#   scripts/sync-generated.sh [--check]
#
# --check reports whether this repository is in step with the generator without
# writing anything, which is what a build or a review wants to know.
set -euo pipefail

CHECKOUT="${CHECKOUT:-/mnt/development/OreStudio/ores_dev_festive_dijkstra}"
SOURCE="$CHECKOUT/projects/ores.typescript/src"
WORKSPACE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

WEB_DEST="$WORKSPACE/packages/web/src/generated"
PROTOCOL_DEST="$WORKSPACE/packages/wire-protocol/src/generated"

CHECK=0
[[ "${1:-}" == "--check" ]] && CHECK=1

if [[ ! -d "$SOURCE" ]]; then
  echo "no generated source at $SOURCE" >&2
  echo "set CHECKOUT to the C++ checkout, or generate first" >&2
  exit 1
fi

staged="$(mktemp -d)"
trap 'rm -rf "$staged"' EXIT

mkdir -p "$staged/web" "$staged/protocol"

# The contract is the shape every declaration is checked against, so it travels
# with them.
cp "$SOURCE/ui-contract.ts" "$staged/web/"

# Per component, by kind.
for component_dir in "$SOURCE"/*/; do
  [[ -d "$component_dir" ]] || continue
  component="$(basename "$component_dir")"
  for kind in ui protocol; do
    [[ -d "$component_dir/$kind" ]] || continue
    target="web"
    [[ "$kind" == "protocol" ]] && target="protocol"
    mkdir -p "$staged/$target/$component/$kind"
    cp "$component_dir/$kind"/*.ts "$staged/$target/$component/$kind/" 2>/dev/null || true
  done
done

sync() {
  local from="$1" to="$2"
  mkdir -p "$to"
  # Replace wholesale: a file the generator no longer emits is a file that should
  # no longer exist here.
  rm -rf "$to"/* 
  cp -r "$from"/. "$to"/
}

if [[ "$CHECK" == "1" ]]; then
  ok=1
  for pair in "$staged/web:$WEB_DEST" "$staged/protocol:$PROTOCOL_DEST"; do
    from="${pair%%:*}"; to="${pair##*:}"
    mkdir -p "$to"
    if ! diff -rq "$from" "$to" >/dev/null 2>&1; then
      echo "generated code is out of step: $to" >&2
      diff -rq "$from" "$to" 2>&1 | head -20 >&2
      ok=0
    fi
  done
  if [[ "$ok" == "1" ]]; then
    echo "generated code is in step"
    exit 0
  fi
  exit 1
fi

sync "$staged/web" "$WEB_DEST"
sync "$staged/protocol" "$PROTOCOL_DEST"

count_web=$(find "$WEB_DEST" -name '*.ts' | wc -l)
count_protocol=$(find "$PROTOCOL_DEST" -name '*.ts' | wc -l)
echo "synced $count_web web declaration(s) and $count_protocol protocol file(s)"

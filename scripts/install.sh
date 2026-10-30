#!/bin/sh
# Link dsh-billing into a DSH profile and add its loader row.
# Idempotent: safe to re-run after an app update or a plugin edit.
#
#   ./scripts/install.sh
#   PEAK_BILLING_SSH_HOST=my-server PEAK_BILLING_SSH_LABEL=My-Server ./scripts/install.sh
set -eu

PLUGIN_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
DSH_HOME=${DSH_HOME:-"$HOME/.dsh"}
PROFILE=${DSH_PROFILE:-desktop}
PROFILE_DIR="$DSH_HOME/profiles/$PROFILE"
PATCH="$PROFILE_DIR/cordis.patch.yml"
SSH_HOST=${PEAK_BILLING_SSH_HOST:-}
SSH_LABEL=${PEAK_BILLING_SSH_LABEL:-$SSH_HOST}

if [ ! -d "$PROFILE_DIR" ]; then
  echo "no such profile: $PROFILE_DIR" >&2
  echo "pass DSH_PROFILE=<name> (the desktop app uses 'desktop')" >&2
  exit 1
fi

mkdir -p "$PROFILE_DIR/node_modules"
ln -sfn "$PLUGIN_DIR" "$PROFILE_DIR/node_modules/dsh-billing"

if grep -q "^[[:space:]]*- id: 'billing'\|^[[:space:]]*- id: billing" "$PATCH" 2>/dev/null; then
  echo "patch row already present in $PATCH (left untouched)"
else
  cp "$PATCH" "$PATCH.bak-$(date +%Y%m%d-%H%M%S)" 2>/dev/null || true
  # A lone `[]` document cannot be followed by block entries.
  if grep -q '^[[:space:]]*\[\][[:space:]]*$' "$PATCH" 2>/dev/null; then
    grep -v '^[[:space:]]*\[\][[:space:]]*$' "$PATCH" > "$PATCH.tmp"
    mv "$PATCH.tmp" "$PATCH"
  fi
  {
    printf '\n- insert:\n    - id: billing\n      name: '"'"'dsh-billing'"'"'\n'
    if [ -n "$SSH_HOST" ]; then
      printf '      config:\n        fleet:\n          sshHost: %s\n' "$SSH_HOST"
      [ "$SSH_LABEL" = "$SSH_HOST" ] || printf '          label: %s\n' "$SSH_LABEL"
    fi
  } >> "$PATCH"
  echo "added billing row to $PATCH"
fi

echo "linked $PLUGIN_DIR -> $PROFILE_DIR/node_modules/dsh-billing"
echo "restart the app (or 'dsh --profile $PROFILE') to load it"

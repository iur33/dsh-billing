#!/bin/sh
# Copy dsh-billing to another machine over SSH and add its loader row.
#
#   ./scripts/deploy-windows.sh <ssh-host> [profile] [remote-home]
#   ./scripts/deploy-windows.sh my-server desktop
#
# The remote side needs tar + node; Windows 10+ ships both (Node via its own
# installer). Nothing is installed globally on the remote.
set -eu

HOST=${1:-}
PROFILE=${2:-desktop}
REMOTE_HOME=${3:-${PEAK_BILLING_REMOTE_HOME:-}}

if [ -z "$HOST" ]; then
  echo "usage: $0 <ssh-host> [profile] [remote-home]" >&2
  exit 2
fi

# Ask the remote shell for its home; %USERPROFILE% on cmd, $HOME elsewhere.
if [ -z "$REMOTE_HOME" ]; then
  REMOTE_HOME=$(ssh -o BatchMode=yes "$HOST" 'echo %USERPROFILE%' 2>/dev/null | tr -d '\r' | tail -1 || true)
  case "$REMOTE_HOME" in
    ''|*%*) REMOTE_HOME=$(ssh -o BatchMode=yes "$HOST" 'echo $HOME' 2>/dev/null | tr -d '\r' | tail -1 || true) ;;
  esac
fi
case "$REMOTE_HOME" in
  ''|*%*) echo "could not resolve the remote home; pass it as the third argument" >&2; exit 1 ;;
esac
REMOTE_HOME=$(printf '%s' "$REMOTE_HOME" | sed 's|\\|/|g')

PROFILE_DIR="$REMOTE_HOME/.dsh/profiles/$PROFILE"
PLUGIN_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
PARENT=$(dirname "$PLUGIN_DIR")
NAME=$(basename "$PLUGIN_DIR")

ssh "$HOST" "if not exist \"$PROFILE_DIR/node_modules\" mkdir \"$PROFILE_DIR/node_modules\""
COPYFILE_DISABLE=1 tar czf - -C "$PARENT" "$NAME" | ssh "$HOST" "tar xzf - -C \"$PROFILE_DIR/node_modules\""
ssh "$HOST" "node - \"$PROFILE_DIR\"" < "$PLUGIN_DIR/scripts/remote-install.mjs"

echo "deployed $NAME to $HOST:$PROFILE_DIR"
echo "restart DSH on $HOST to load it"

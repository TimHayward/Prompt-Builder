#!/bin/sh
#
# Container entrypoint
#
# Takes ownership of the data directory, then gives up root and runs the
# application as node.
#
# /app/data is a mounted volume, and a mount shadows whatever ownership the
# image gave that path. A volume created by a build of this image from before
# it ran as node arrives owned by root, and SQLite then fails with "attempt to
# write a readonly database" — which names neither the directory nor the
# cause. Correcting it needs root, so the container starts as root and drops
# the privilege here rather than serving anything with it.

set -e

if [ "$(id -u)" = 0 ]; then
  if ! chown -R node:node /app/data 2>/dev/null; then
    echo "prompt-builder: cannot take ownership of /app/data." >&2
    echo "prompt-builder: is the volume mounted read-only?" >&2
    exit 1
  fi

  # setpriv execs rather than forking, so the application stays PID 1 and
  # still receives the signals Docker sends it on stop.
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi

# Started as some other user, so the chown above was not ours to make. Say
# what is wrong and how to put it right, rather than leaving SQLite to report
# a readonly database several steps later.
if [ ! -w /app/data ]; then
  echo "prompt-builder: /app/data is not writable by uid $(id -u)." >&2
  echo "prompt-builder: correct the volume's ownership, for example:" >&2
  echo "  docker run --rm -v <volume>:/data alpine chown -R $(id -u):$(id -g) /data" >&2
  exit 1
fi

exec "$@"

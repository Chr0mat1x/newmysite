#!/usr/bin/env bash
# Publish the offline ORBIT demo to GitHub Pages.
#
# The static build is committed into the branch that already serves
# https://chr0mat1x.github.io/, under /orbit/. A Pages "workflow" source would
# need its own site enabled and a token that can create one; committing to an
# existing Pages branch needs neither, so the link is reproducible from here.
#
# The clone lives outside the repo and is rebuilt each run, so this never
# touches the working tree.
#
# Two modes:
#   tools/deploy-pages.sh            offline demo (localStorage, no server)
#   ORBIT_ONLINE=1 tools/deploy-pages.sh   real backend from .env.online
# The online mode is what gives the hosted site working accounts and email
# confirmation; it needs a Supabase project in `.env.online` first.
#
# Usage: tools/deploy-pages.sh

set -euo pipefail

REPO_URL="https://github.com/Chr0mat1x/Chr0mat1x.github.io.git"
TARGET="/tmp/orbit-pages-deploy"
SUBPATH="orbit"
BASE="/${SUBPATH}/"

cd "$(dirname "$0")/.."

if [ "${ORBIT_ONLINE:-0}" = "1" ]; then
  if [ ! -f .env.online ]; then
    echo "ERROR: ORBIT_ONLINE=1 needs .env.online (copy .env.online.example and fill it in)" >&2
    exit 1
  fi
  echo "==> building the online bundle with a live backend (VITE_BASE=${BASE})"
  VITE_BASE="${BASE}" npm run build:online
else
  echo "==> building the offline bundle (VITE_BASE=${BASE})"
  VITE_BASE="${BASE}" npm run build:pages

  echo "==> checking the bundle is offline (no backend baked in)"
  if grep -qE 'eyJhbGciOi|"/sb"' dist/assets/*.js; then
    echo "ERROR: a Supabase URL/key leaked into the public bundle" >&2
    exit 1
  fi
fi

echo "==> staging into ${REPO_URL} (${SUBPATH}/)"
rm -rf "${TARGET}"
git clone --depth 1 "${REPO_URL}" "${TARGET}"
rm -rf "${TARGET:?}/${SUBPATH}"
cp -r dist "${TARGET}/${SUBPATH}"
if [ "${ORBIT_ONLINE:-0}" = "1" ]; then
  cat > "${TARGET}/${SUBPATH}/README.md" <<EOF
# ORBIT

Live ORBIT, backed by a Supabase project (accounts + email confirmation).

Source: https://github.com/Chr0mat1x/newmysite
Built with: VITE_BASE=${BASE} npm run build:online
EOF
else
  cat > "${TARGET}/${SUBPATH}/README.md" <<EOF
# ORBIT

Static demo of ORBIT, deployed here so the link outlives any preview host.
Source: https://github.com/Chr0mat1x/newmysite

Built with: VITE_BASE=${BASE} npm run build:pages
EOF
fi

cd "${TARGET}"
git add -A
if git diff --cached --quiet; then
  echo "==> nothing changed; already up to date"
  exit 0
fi
git -c user.name=orbit-deploy -c user.email=orbit-deploy@users.noreply.github.com \
  commit -q -m "Deploy ORBIT demo to /${SUBPATH}/"
git push origin HEAD

echo "==> done. Pages usually updates within a minute:"
echo "    https://chr0mat1x.github.io/${SUBPATH}/"

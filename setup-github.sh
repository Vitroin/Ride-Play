#!/usr/bin/env bash
# One-time setup: creates the GitHub repo, pushes the code, turns on GitHub Pages.
# Usage:  ./setup-github.sh            (public repo, free Pages)
#         ./setup-github.sh my-name    (custom repo name)
set -euo pipefail
REPO="${1:-moto-dash}"
cd "$(dirname "$0")"

command -v git >/dev/null || { echo "Install Git first: https://git-scm.com/downloads"; exit 1; }
command -v gh  >/dev/null || { echo "Install GitHub CLI first: https://cli.github.com"; exit 1; }
gh auth status >/dev/null 2>&1 || gh auth login --web --git-protocol https

USER_LOGIN="$(gh api user -q .login)"
echo "→ GitHub account: $USER_LOGIN"

if [ ! -d .git ]; then git init -q -b main; fi
git add -A
git diff --cached --quiet || git commit -qm "Moto Dash"
git branch -M main

if gh repo view "$USER_LOGIN/$REPO" >/dev/null 2>&1; then
  echo "→ Repo exists, pushing"
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$USER_LOGIN/$REPO.git"
  git push -u origin main
else
  echo "→ Creating public repo $REPO"
  gh repo create "$REPO" --public --source . --remote origin --push
fi

echo "→ Turning on GitHub Pages (deploys via GitHub Actions)"
gh api -X POST "repos/$USER_LOGIN/$REPO/pages" -f build_type=workflow >/dev/null 2>&1 \
  || gh api -X PUT "repos/$USER_LOGIN/$REPO/pages" -f build_type=workflow >/dev/null 2>&1 || true
gh workflow run deploy.yml -R "$USER_LOGIN/$REPO" >/dev/null 2>&1 || true

URL="https://$(echo "$USER_LOGIN" | tr '[:upper:]' '[:lower:]').github.io/$REPO/"
cat <<MSG

✅ Done. In about a minute the app is live at:
   $URL

Next:
 1. Spotify dashboard → your app → Redirect URI:  $URL
 2. Open $URL in Safari on your iPhone → Share → Add to Home Screen
 3. Open it from the Home Screen → Setup & API keys → paste keys → Log in

Watch the deploy: https://github.com/$USER_LOGIN/$REPO/actions
MSG

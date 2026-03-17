#!/usr/bin/env bash

set -euo pipefail

REPO_DIR="${REPO_DIR:-$HOME/MyVoicer}"
BRANCH="${BRANCH:-feature/relay-aes-headless}"

echo "[update] repo: $REPO_DIR"
echo "[update] branch: $BRANCH"
echo "[update] force sync with origin/$BRANCH"

git fetch origin
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"
git clean -fd

echo "[update] done"

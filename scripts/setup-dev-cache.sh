#!/usr/bin/env bash
#
# Why this exists:
# This project lives on a slow secondary volume (~32 MB/s vs ~220 MB/s on the
# internal disk). Next.js/Turbopack keeps a persistent build cache under
# ".next/cache" and does heavy disk I/O on it (e.g. multi-second "filesystem
# cache database compaction"). On the slow volume this made `next dev` hang for
# 90s+ when compiling routes on-demand (the app looked stuck on the splash).
#
# Fix: keep ".next" as a real directory inside the project (so Node module
# resolution for things like @tailwindcss/postcss still works), but redirect
# only ".next/cache" onto the fast internal disk via a symlink.
#
# This runs automatically before `npm run dev` (npm "predev" hook).
set -e

# Where to keep the cache (override with NEXT_CACHE_DIR if you want).
CACHE_DIR="${NEXT_CACHE_DIR:-$HOME/.next-cache/new-hydra-cache}"

mkdir -p "$CACHE_DIR"
mkdir -p .next

# If a previous run created .next/cache as a real directory, replace it.
if [ -e .next/cache ] && [ ! -L .next/cache ]; then
  rm -rf .next/cache
fi

# Create (or leave) the symlink pointing at the fast disk.
if [ ! -L .next/cache ]; then
  ln -s "$CACHE_DIR" .next/cache
  echo "[setup-dev-cache] linked .next/cache -> $CACHE_DIR"
else
  echo "[setup-dev-cache] .next/cache already linked -> $(readlink .next/cache)"
fi

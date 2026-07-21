#!/bin/sh
# Point git at the versioned hooks dir and make hooks executable.
git config core.hooksPath scripts/git-hooks
chmod +x scripts/git-hooks/* 2>/dev/null || true
echo "✓ git hooks configured (core.hooksPath=scripts/git-hooks)"

#!/usr/bin/env python3
"""
Change threshold classifier for OpenWiki documentation updates.

Reads the list of changed files from git and classifies the set into
one of four tiers:

  critical    — auth flows, API contracts, Lambda, SST infra, release scripts.
                Triggers an immediate high-priority PR + GitHub issue.
  significant — UI components, screens, hooks, providers.
                Triggers a standard docs-update PR.
  minor       — translations, type definitions, lint/metro config.
                Batched into the weekly scheduled run; no immediate PR.
  skip        — docs, tests, lock files, assets, version bumps, markdown.
                No action taken.

The script also emits:
  changed_areas — comma-separated list of named subsystems that changed.
                  Passed to OpenWiki so it can focus on relevant docs.
  needs_claude_md_review — 'true' when critical infra/auth/release paths
                  changed and CLAUDE.md may need a manual review pass.

Output is written to $GITHUB_OUTPUT for consumption by downstream jobs.

Usage (called by the GitHub Actions workflow):
  python .github/scripts/classify_changes.py

Or locally (prints results instead of writing to GITHUB_OUTPUT):
  BASE_SHA=HEAD~3 python3 .github/scripts/classify_changes.py
"""

import json
import os
import re
import subprocess
import sys
from pathlib import Path

# ── Patterns that cause a file to be skipped entirely ─────────────────────────
# If ALL changed files match skip patterns the whole run is skipped.

SKIP_PATTERNS = [
    r"^apps/docs/",
    r"\.test\.(ts|tsx|js)$",
    r"\.spec\.(ts|tsx|js)$",
    r"^pnpm-lock\.yaml$",
    r"^package-lock\.json$",
    r"^yarn\.lock$",
    r"CHANGELOG\.md$",
    r"^\.env",
    r"/assets/",
    r"/static/",
    r"\.(png|jpg|jpeg|gif|ico|webp|svg|woff|woff2|ttf|eot)$",
    r"^archive/",
    r"^\.github/scripts/",           # classifier itself
    r"^\.github/workflows/",         # workflow changes don't need docs
    # Version bump files produced by the release script — not meaningful source changes
    r"apps/mobile-app/config/version",
    r"apps/mobile-app/public/",
    r"/package\.json$",              # dep/version bumps in any package.json
    r"^package\.json$",
    r"^app\.json$",                  # root expo config (version bump by release script)
    r"apps/mobile-app/app\.json$",   # mobile expo config (version bump)
    r"^README\.md$",
]

# ── Critical tier ──────────────────────────────────────────────────────────────
# Any match here elevates the whole run to 'critical'.
# Keys are regex patterns; values are human-readable area names emitted in
# changed_areas so OpenWiki and PR descriptions are specific.

CRITICAL_PATTERNS: dict[str, str] = {
    # Core API abstraction
    r"apps/mobile-app/lib/api-client\.ts":              "api-client",
    r"apps/mobile-app/lib/api-middleware\.ts":          "api-middleware",

    # Auth library and server utilities
    r"apps/mobile-app/lib/auth/":                       "auth-lib",
    r"apps/mobile-app/lib/supabase":                    "supabase-client",
    r"apps/mobile-app/lib/supabase-server":             "supabase-server",
    r"apps/mobile-app/lib/wallet-auth":                 "wallet-auth",
    r"apps/mobile-app/lib/server/":                     "server-lib",
    r"apps/mobile-app/lib/backend/":                    "backend-lib",
    r"apps/mobile-app/lib/admin-utils\.ts":             "admin-utils",
    r"apps/mobile-app/lib/directus-auth":               "directus-auth",
    r"apps/mobile-app/lib/directus-api-auth":           "directus-api-auth",

    # Auth and OAuth API routes
    r"apps/mobile-app/app/api/auth/":                   "auth-api",
    r"apps/mobile-app/app/api/auth/oauth/":             "oauth-api",
    r"apps/mobile-app/app/api/auth/otp":                "otp-api",
    r"apps/mobile-app/app/api/auth/wallet/":            "wallet-api",

    # Event system (routing, branding, config)
    r"apps/mobile-app/lib/event-detector\.ts":          "event-detector",
    r"apps/mobile-app/lib/event-branding\.ts":          "event-branding",
    r"apps/mobile-app/lib/event-path\.ts":              "event-path",
    r"packages/config/src/events\.ts":                  "event-config",

    # App-wide React contexts
    r"apps/mobile-app/contexts/":                       "app-contexts",

    # QR and pass systems
    r"apps/mobile-app/lib/qr-system\.ts":               "qr-system",
    r"apps/mobile-app/lib/pass-system\.ts":             "pass-system",
    r"apps/mobile-app/app/api/qr/":                     "qr-api",

    # Infrastructure — source files only (not package.json / lock files)
    r"packages/infra/lambda/.*\.(js|ts)$":              "lambda-handler",
    r"packages/infra/sst\.config\.ts":                  "sst-infra",
    r"packages/infra/src/.*\.(ts|js)$":                 "infra-stack",
    r"packages/infra/cloudflare/.*\.(ts|js)$":          "cloudflare-worker",

    # Auth and backend packages — source only
    r"packages/auth/src/.*\.(ts|js)$":                  "auth-package",
    r"packages/backend/src/.*\.(ts|js)$":               "backend-package",

    # Release and tooling scripts
    r"packages/tools/scripts/release\.js$":             "release-scripts",
    r"packages/tools/scripts/package-lambda\.sh$":      "lambda-packaging",
}

# Subset of critical areas that also flag CLAUDE.md for manual review.
# These are paths where the CLAUDE.md operational notes are likely to drift.
CLAUDE_MD_SENSITIVE_AREAS = {
    "api-client", "auth-api", "oauth-api", "otp-api", "wallet-api",
    "lambda-handler", "sst-infra", "infra-stack",
    "release-scripts", "auth-lib", "supabase-client",
    "event-detector", "event-config",
    "auth-package", "app-contexts",
}

# ── Significant tier ───────────────────────────────────────────────────────────

SIGNIFICANT_PATTERNS: dict[str, str] = {
    r"apps/mobile-app/components/":                     "components",
    r"apps/mobile-app/app/(?!api/)":                    "screens",
    r"apps/mobile-app/hooks/":                          "hooks",
    r"apps/mobile-app/providers/":                      "providers",
    r"apps/mobile-app/lib/":                            "utilities",  # non-critical lib
    r"packages/config/":                                "config-package",
    r"packages/emails/":                                "email-templates",
    r"packages/i18n/":                                  "i18n-package",
    r"packages/tools/":                                 "tooling",
}

# ── Minor tier ─────────────────────────────────────────────────────────────────

MINOR_PATTERNS: dict[str, str] = {
    r"apps/mobile-app/i18n/":                           "translations",
    r"apps/mobile-app/types/":                          "type-definitions",
    r"apps/mobile-app/constants/":                      "constants",
    r"\.eslintrc":                                      "lint-config",
    r"tsconfig\.json$":                                 "ts-config",
    r"metro\.config":                                   "metro-config",
}

# ── Tier ordering (higher index = higher priority) ─────────────────────────────
TIER_RANK = {"skip": 0, "minor": 1, "significant": 2, "critical": 3}


def get_changed_files(base_sha: str | None = None) -> list[str]:
    """Return the list of files changed relative to base_sha."""
    if base_sha and base_sha not in ("", "0000000000000000000000000000000000000000"):
        cmd = ["git", "diff", "--name-only", base_sha, "HEAD"]
    else:
        # Fallback: diff against the previous commit
        cmd = ["git", "diff", "--name-only", "HEAD~1", "HEAD"]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"[classify] git diff failed: {result.stderr}", file=sys.stderr)
        return []

    return [f.strip() for f in result.stdout.splitlines() if f.strip()]


def matches_any(path: str, patterns: dict[str, str]) -> list[str]:
    """Return area names for all patterns that match the given path."""
    return [area for pattern, area in patterns.items() if re.search(pattern, path)]


def classify(files: list[str]) -> dict:
    """
    Classify a list of changed file paths.

    Returns a dict with:
      tier                   : 'critical' | 'significant' | 'minor' | 'skip'
      changed_areas          : sorted list of matched area names
      skip                   : bool — True when every file is in a skip-only category
      needs_claude_md_review : bool
    """
    if not files:
        return {
            "tier": "skip",
            "changed_areas": [],
            "skip": True,
            "needs_claude_md_review": False,
        }

    best_tier = "skip"
    all_areas: set[str] = set()
    has_actionable = False

    for path in files:
        # Check skip first — these files never need docs updates
        if any(re.search(p, path) for p in SKIP_PATTERNS):
            continue

        has_actionable = True

        # Check tiers from highest to lowest; collect all matching areas
        critical_areas = matches_any(path, CRITICAL_PATTERNS)
        significant_areas = matches_any(path, SIGNIFICANT_PATTERNS)
        minor_areas = matches_any(path, MINOR_PATTERNS)

        if critical_areas:
            all_areas.update(critical_areas)
            if TIER_RANK["critical"] > TIER_RANK[best_tier]:
                best_tier = "critical"
        elif significant_areas:
            all_areas.update(significant_areas)
            if TIER_RANK["significant"] > TIER_RANK[best_tier]:
                best_tier = "significant"
        elif minor_areas:
            all_areas.update(minor_areas)
            if TIER_RANK["minor"] > TIER_RANK[best_tier]:
                best_tier = "minor"
        else:
            # Changed file doesn't match any known pattern → treat as significant
            # so we don't silently skip real code changes
            all_areas.add("unknown")
            if TIER_RANK["significant"] > TIER_RANK[best_tier]:
                best_tier = "significant"

    skip = not has_actionable or best_tier == "skip"

    needs_claude_md_review = bool(
        not skip
        and best_tier == "critical"
        and all_areas & CLAUDE_MD_SENSITIVE_AREAS
    )

    return {
        "tier": best_tier if not skip else "skip",
        "changed_areas": sorted(all_areas),
        "skip": skip,
        "needs_claude_md_review": needs_claude_md_review,
    }


def write_github_output(result: dict, changed_files: list[str]) -> None:
    """Write outputs to $GITHUB_OUTPUT (GitHub Actions) or stdout (local)."""
    output_path = os.environ.get("GITHUB_OUTPUT")

    lines = [
        f"tier={result['tier']}",
        f"changed_areas={','.join(result['changed_areas'])}",
        f"skip={'true' if result['skip'] else 'false'}",
        f"needs_claude_md_review={'true' if result['needs_claude_md_review'] else 'false'}",
        f"changed_files_count={len(changed_files)}",
    ]

    if output_path:
        with open(output_path, "a") as f:
            f.write("\n".join(lines) + "\n")
    else:
        # Local run — print summary
        print("\n── Change Classification ─────────────────────────────")
        for line in lines:
            print(f"  {line}")
        print("─────────────────────────────────────────────────────\n")


def main() -> None:
    base_sha = os.environ.get("BASE_SHA") or os.environ.get("GITHUB_SHA_BEFORE")
    changed_files = get_changed_files(base_sha)

    print(f"[classify] {len(changed_files)} changed file(s)", file=sys.stderr)
    for f in changed_files[:20]:
        print(f"  {f}", file=sys.stderr)
    if len(changed_files) > 20:
        print(f"  ... and {len(changed_files) - 20} more", file=sys.stderr)

    result = classify(changed_files)

    print(
        f"[classify] tier={result['tier']}  "
        f"areas={result['changed_areas']}  "
        f"skip={result['skip']}  "
        f"claude_md={result['needs_claude_md_review']}",
        file=sys.stderr,
    )

    write_github_output(result, changed_files)


if __name__ == "__main__":
    main()

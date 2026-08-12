#!/usr/bin/env python3
"""
Guardrail for public/docs email exposure in PRs.

Scans changed files under public-facing paths and fails when new diff hunks
introduce non-allowlisted email literals. This is intentionally strict:
public docs and public assets should avoid hardcoded user-identifying emails.
"""

from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", re.IGNORECASE)

PUBLIC_FILE_PATTERNS = (
    re.compile(r"^apps/docs/"),
    re.compile(r"^archive/docs/"),
    re.compile(r"^apps/mobile-app/public/"),
)

ALLOWLIST = {
    "support@hashpass.club",
    "hello@hashpass.club",
    "support@hashpass.tech",
    "contact@hashpass.tech",
    "privacy@hashpass.tech",
    "legal@hashpass.tech",
    "no-reply@hashpass.tech",
    "noreply@hashpass.tech",
}

PLACEHOLDER_DOMAINS = {
    "example.com",
    "example.org",
    "example.net",
    "example.co",
}

FORCE_FAIL_EXIT = "--enforce" in sys.argv[1:] or os.getenv("PRIVACY_CHECK_ENFORCE", "").strip() == "1"


def write_output(key: str, value: str) -> None:
    output_path = os.getenv("GITHUB_OUTPUT")
    if not output_path:
        return
    with Path(output_path).open("a", encoding="utf-8") as out:
        if "\n" in value:
            marker = "EOF"
            out.write(f"{key}<<{marker}\n")
            out.write(value)
            out.write(f"\n{marker}\n")
        else:
            out.write(f"{key}={value}\n")


def is_public_file(path: str) -> bool:
    return any(pattern.match(path) for pattern in PUBLIC_FILE_PATTERNS)


def is_allowed_email(email: str) -> bool:
    lowered = email.lower()
    if lowered in ALLOWLIST:
        return True
    if "@" not in lowered:
        return True
    domain = lowered.split("@", 1)[1]
    if domain in PLACEHOLDER_DOMAINS:
        return True
    return False


def parse_added_lines(diff_text: str) -> list[tuple[int, str]]:
    """
    Parse email-bearing lines from added hunks only. Returns tuple of new-file
    line number and line text.
    """
    entries: list[tuple[int, str]] = []
    new_line = None

    for raw_line in diff_text.splitlines():
        if raw_line.startswith("@@"):
            match = re.match(r"@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@", raw_line)
            if match:
                new_line = int(match.group(1))
            continue

        if raw_line.startswith("+++"):
            continue

        if not raw_line or new_line is None:
            continue

        marker = raw_line[0]
        content = raw_line[1:]

        if marker == "+":
            entries.append((new_line, content))
            new_line += 1
        elif marker == " ":
            new_line += 1

    return entries


def diff_for_file(file_path: str, base_sha: str, head_sha: str) -> str:
    cmd = ["git", "diff", "-U0", base_sha, head_sha, "--", file_path]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"Unable to diff {file_path}: {result.stderr.strip()}")
    return result.stdout


def main() -> int:
    base_sha = os.getenv("BASE_SHA")
    head_sha = os.getenv("HEAD_SHA")
    if not base_sha or not head_sha:
        write_output("blocked", "false")
        write_output("count", "0")
        write_output("report_path", "")
        write_output("findings", "No PR range metadata available for this run.")
        print("privacy_exposure_check: missing BASE_SHA/HEAD_SHA; skipping.")
        return 0

    pr_files_path = "/tmp/pr_files.txt"
    if Path(pr_files_path).exists():
        changed_files = [line.strip() for line in Path(pr_files_path).read_text(encoding="utf-8").splitlines() if line.strip()]
    else:
        list_cmd = ["git", "diff", "--name-only", base_sha, head_sha]
        result = subprocess.run(list_cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(f"Unable to list changed files: {result.stderr.strip()}")
        changed_files = [line.strip() for line in result.stdout.splitlines() if line.strip()]

    findings: list[str] = []
    for file_path in changed_files:
        if not is_public_file(file_path):
            continue

        diff = diff_for_file(file_path, base_sha, head_sha)
        for line_no, line in parse_added_lines(diff):
            for match in EMAIL_RE.findall(line):
                lowered = match.lower()
                if is_allowed_email(lowered):
                    continue
                findings.append(f"{file_path}:{line_no}: {match}")

    if findings:
        report_path = Path("/tmp/privacy-exposure-findings.txt")
        report_path.write_text(
            "\n".join(findings) + "\n",
            encoding="utf-8",
        )
        write_output("blocked", "true")
        write_output("count", str(len(findings)))
        write_output("report_path", str(report_path))
        write_output("findings", "\n".join(findings))
        print("Privacy exposure check failed:")
        for item in findings:
            print(f" - {item}")
        if FORCE_FAIL_EXIT:
            print("privacy_exposure_check: failing release preflight due to blocked findings.")
            return 1
        return 0

    print("Privacy exposure check passed: no new non-allowlisted emails in public/docs diffs.")
    write_output("blocked", "false")
    write_output("count", "0")
    write_output("report_path", "")
    write_output("findings", "")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

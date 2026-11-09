"""Alert when the newest verified database state is too old or suspicious.

Runs on EventBridge, independent of GitHub, so it also catches a backup schedule
that silently stopped. Uses only s3:ListBucket (object metadata), never object
contents. CHECKS is a JSON list of {prefix, max_age_hours, min_bytes}.
"""
import datetime
import json
import os
import re

import boto3

REPO_URL = os.environ.get("REPO_URL", "https://github.com/hashpass-tech/hashpass.tech")
RUNBOOK_URL = f"{REPO_URL}/blob/main/apps/docs/docs/infra/database-backup-and-recovery.md"
WORKFLOW_URL = f"{REPO_URL}/actions/workflows/db-backup.yml"
MANUAL_BACKUP_CMD = "gh workflow run db-backup.yml --repo hashpass-tech/hashpass.tech --ref main --field target={target}"

# Plain-language names for each checked prefix.
DATABASES = {
    "prod/core/": ("Core production database", "core-production", "core-prod"),
    "dev/shared/": ("Shared development database", "shared-dev", "dev-shared"),
}

s3 = boto3.client("s3")
s3_replica = boto3.client("s3", region_name=os.environ.get("REPLICA_REGION"))
sns = boto3.client("sns")


def newest_backup_state(client, bucket, prefix, min_bytes):
    objects = {}
    for page in client.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=prefix):
        for obj in page.get("Contents", []):
            objects[obj["Key"]] = obj

    dumps = {key: obj for key, obj in objects.items() if key.endswith(".dump")}
    if not dumps:
        return None

    newest = max(dumps.values(), key=lambda obj: obj["LastModified"])
    _, _, dump_name = DATABASES.get(prefix, (prefix, "core-production", prefix.rstrip("/")))
    marker_prefix = f"{prefix}_verification/{dump_name}_"
    newest_marker = None
    for obj in objects.values():
        key = obj["Key"]
        if not key.startswith(marker_prefix) or not key.endswith(".unchanged") or obj.get("Size", 0) <= 0:
            continue

        stem = key[len(marker_prefix):-len(".unchanged")]
        parts = stem.split("__", 1)
        if len(parts) != 2:
            continue
        verified_at, dump_basename = parts
        if not re.fullmatch(r"\d{8}T\d{6}Z", verified_at):
            continue
        if not re.fullmatch(re.escape(dump_name) + r"_\d{8}T\d{6}Z\.dump", dump_basename):
            continue

        baseline = f"{prefix}{dump_basename}"
        if baseline != newest["Key"] or newest["Size"] < min_bytes:
            continue
        if obj["LastModified"] <= newest["LastModified"]:
            continue
        if newest_marker is None or obj["LastModified"] > newest_marker["LastModified"]:
            newest_marker = obj

    if newest_marker is None:
        return newest
    return {
        **newest,
        "LastModified": newest_marker["LastModified"],
        "verified_unchanged": True,
        "verification_key": newest_marker["Key"],
        "dump_last_modified": newest["LastModified"],
    }


def _hours(value):
    return f"{value:.1f} hours"


def evaluate(check, obj, now):
    """Return a structured problem for one check, or None when it is healthy."""
    replica = check.get("replica", False)
    name, target, _ = DATABASES.get(check["prefix"], (check["prefix"], "core-production", check["prefix"]))
    problem = {"database": name, "target": target, "replica": replica, "key": None, "kind": None}
    if obj is None:
        problem["kind"] = "missing"
        return problem
    age_h = (now - obj["LastModified"]).total_seconds() / 3600
    problem.update(
        key=obj["Key"],
        age_h=age_h,
        last_modified=obj["LastModified"],
        size=obj["Size"],
        verified_unchanged=obj.get("verified_unchanged", False),
        verification_key=obj.get("verification_key"),
        dump_last_modified=obj.get("dump_last_modified"),
    )
    if obj["Size"] < check["min_bytes"]:
        problem.update(kind="small", min_bytes=check["min_bytes"])
        return problem
    if age_h > check["max_age_hours"]:
        problem.update(kind="stale", limit_h=check["max_age_hours"])
        return problem
    return None


def describe(problem):
    """One problem as a readable block: what happened, what it means, what to do."""
    scope = f"{problem['database']}" + (" - copy in the replica bucket (us-west-2)" if problem["replica"] else "")
    lines = [f"* {scope}"]
    kind = problem["kind"]
    if kind == "missing":
        lines += [
            "  What happened: no backup file (.dump) exists at all.",
            "  Why it matters: there is nothing to restore from.",
            "  Likely cause: backups never ran, the backup role lost access, or the files were deleted.",
        ]
    elif kind == "stale":
        late = problem["age_h"] - problem["limit_h"]
        ts = problem["last_modified"].strftime("%Y-%m-%d %H:%M UTC")
        if problem["verified_unchanged"]:
            dump_ts = problem["dump_last_modified"].strftime("%Y-%m-%d %H:%M UTC")
            lines += [
                f"  What happened: the newest unchanged-data verification is {_hours(problem['age_h'])} old; it must be under "
                f"{problem['limit_h']} hours ({_hours(late)} overdue).",
                f"  Last full dump: {problem['key']} (written {dump_ts}); unchanged verification: {problem['verification_key']} (written {ts}).",
            ]
        else:
            lines += [
                f"  What happened: the newest backup is {_hours(problem['age_h'])} old; it must be under "
                f"{problem['limit_h']} hours ({_hours(late)} overdue).",
                f"  Newest backup: {problem['key']} (written {ts}).",
            ]
        if problem["replica"]:
            lines += [
                "  Why it matters: the copy in the second region is behind. Check the first line of this alert:",
                "  if the primary bucket is healthy, only replication is delayed and nothing is lost yet.",
                "  Likely cause: S3 replication lag or failure.",
            ]
        else:
            if problem["verified_unchanged"]:
                lines += [
                    f"  Why it matters: the full dump is the restore point. It was verified unchanged {_hours(problem['age_h'])} ago; writes since that check may be lost.",
                    "  This is the only backup: the Supabase free plan has no point-in-time recovery.",
                    "  Likely cause: GitHub delayed or skipped a scheduled verification, or the backup workflow could not read its state metadata.",
                ]
            else:
                lines += [
                    f"  Why it matters: if this database were lost right now, you would lose everything written in the last {_hours(problem['age_h'])}.",
                    "  This is the only backup: the Supabase free plan has no point-in-time recovery.",
                    "  Likely cause (most common): GitHub delayed or skipped a scheduled run. The job is meant to run every 6 hours,",
                    "  but GitHub does not guarantee scheduled workflows start on time. Less common: the workflow is failing,",
                    "  the database credential/secret was rotated, the AWS role was changed, or the project is paused.",
                ]
    elif kind == "small":
        lines += [
            f"  What happened: the newest backup is only {problem['size']:,} bytes; a real dump is at least {problem['min_bytes']:,} bytes.",
            f"  Newest backup: {problem['key']}.",
            "  Why it matters: the file is probably empty or truncated and may not restore.",
            "  Likely cause: the dump ran against an empty or wrong database, or was cut off.",
        ]
    lines.append(f"  Fix: {MANUAL_BACKUP_CMD.format(target=problem['target'])}")
    return "\n".join(lines)


def build_message(problems, now):
    stale = [p for p in problems if p["kind"] == "stale" and not p["replica"]]
    summary = (
        "A HASHPASS database backup is late, missing or suspicious. Backups are the only way to recover "
        "the database, so please check it today."
    )
    if stale and not any(p["kind"] in ("missing", "small") for p in problems):
        if any(p["verified_unchanged"] for p in stale):
            summary += " An unchanged database state was verified previously, but the latest verification is older than allowed."
        else:
            summary += (
                " The backups have not failed outright; the newest one is just older than allowed. "
                "That is usually a delayed scheduled run and fixes itself on the next run, but confirm it did."
            )
    return "\n".join(
        [
            summary,
            "",
            f"Checked at: {now.strftime('%Y-%m-%d %H:%M UTC')}",
            "",
            "PROBLEMS",
            "\n\n".join(describe(p) for p in problems),
            "",
            "WHAT TO DO",
            f"1. Open the backup runs and look for a recent success or a red failure: {WORKFLOW_URL}",
            "2. If the latest run failed, open it and read the failing step. If no recent run exists, start one with the Fix command above.",
            "3. After a run succeeds, this alert clears itself within 2 hours (the check runs every 2 hours).",
            "4. If it keeps repeating, follow the runbook below.",
            "",
            f"Runbook: {RUNBOOK_URL}",
            "",
            "This check is independent of GitHub: it only lists backup file ages in S3 and cannot read the backups.",
        ]
    )


def handler(event, context):
    bucket = os.environ["BUCKET"]
    now = datetime.datetime.now(datetime.timezone.utc)
    problems = []
    for check in json.loads(os.environ["CHECKS"]):
        replica = check.get("replica", False)
        obj = (
            newest_backup_state(s3_replica, os.environ["REPLICA_BUCKET"], check["prefix"], check["min_bytes"])
            if replica
            else newest_backup_state(s3, bucket, check["prefix"], check["min_bytes"])
        )
        problem = evaluate(check, obj, now)
        if problem:
            problems.append(problem)
    if problems:
        kinds = {p["kind"] for p in problems}
        subject = (
            "HASHPASS database backup MISSING" if "missing" in kinds
            else "HASHPASS database backup is late" if kinds == {"stale"}
            else "HASHPASS database backup problem"
        )
        sns.publish(TopicArn=os.environ["TOPIC_ARN"], Subject=subject, Message=build_message(problems, now))
    summary = [{k: str(v) for k, v in p.items() if k in ("database", "kind", "key", "replica", "verified_unchanged")} for p in problems]
    print(json.dumps({"problems": summary}))
    return {"problems": summary}

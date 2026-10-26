"""Alert when the newest database dump is too old or too small.

Runs on EventBridge, independent of GitHub, so it also catches a backup schedule
that silently stopped. Uses only s3:ListBucket (object metadata), never object
contents. CHECKS is a JSON list of {prefix, max_age_hours, min_bytes}.
"""
import datetime
import json
import os

import boto3

REPO_URL = os.environ.get("REPO_URL", "https://github.com/hashpass-tech/hashpass.tech")
RUNBOOK_URL = f"{REPO_URL}/blob/main/apps/docs/docs/infra/database-backup-and-recovery.md"
WORKFLOW_URL = f"{REPO_URL}/actions/workflows/db-backup.yml"
MANUAL_BACKUP_CMD = "gh workflow run db-backup.yml --repo hashpass-tech/hashpass.tech --ref main --field target={target}"

# Plain-language names for each checked prefix.
DATABASES = {
    "prod/core/": ("Core production database", "core-production"),
    "dev/shared/": ("Shared development database", "shared-dev"),
}

s3 = boto3.client("s3")
s3_replica = boto3.client("s3", region_name=os.environ.get("REPLICA_REGION"))
sns = boto3.client("sns")


def newest_dump(client, bucket, prefix):
    newest = None
    for page in client.get_paginator("list_objects_v2").paginate(Bucket=bucket, Prefix=prefix):
        for obj in page.get("Contents", []):
            if obj["Key"].endswith(".dump") and (newest is None or obj["LastModified"] > newest["LastModified"]):
                newest = obj
    return newest


def _hours(value):
    return f"{value:.1f} hours"


def evaluate(check, obj, now):
    """Return a structured problem for one check, or None when it is healthy."""
    replica = check.get("replica", False)
    name, target = DATABASES.get(check["prefix"], (check["prefix"], "core-production"))
    problem = {"database": name, "target": target, "replica": replica, "key": None, "kind": None}
    if obj is None:
        problem["kind"] = "missing"
        return problem
    age_h = (now - obj["LastModified"]).total_seconds() / 3600
    problem.update(key=obj["Key"], age_h=age_h, last_modified=obj["LastModified"], size=obj["Size"])
    if age_h > check["max_age_hours"]:
        problem.update(kind="stale", limit_h=check["max_age_hours"])
        return problem
    if obj["Size"] < check["min_bytes"]:
        problem.update(kind="small", min_bytes=check["min_bytes"])
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
            newest_dump(s3_replica, os.environ["REPLICA_BUCKET"], check["prefix"])
            if replica
            else newest_dump(s3, bucket, check["prefix"])
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
    summary = [{k: str(v) for k, v in p.items() if k in ("database", "kind", "key", "replica")} for p in problems]
    print(json.dumps({"problems": summary}))
    return {"problems": summary}

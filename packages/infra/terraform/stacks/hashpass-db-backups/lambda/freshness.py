"""Alert when the newest database dump is too old or too small.

Runs on EventBridge, independent of GitHub, so it also catches a backup schedule
that silently stopped. Uses only s3:ListBucket (object metadata), never object
contents. CHECKS is a JSON list of {prefix, max_age_hours, min_bytes}.
"""
import datetime
import json
import os

import boto3

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


def handler(event, context):
    bucket = os.environ["BUCKET"]
    now = datetime.datetime.now(datetime.timezone.utc)
    problems = []
    for check in json.loads(os.environ["CHECKS"]):
        replica = check.get("replica", False)
        label = ("replica " if replica else "") + check["prefix"]
        obj = (
            newest_dump(s3_replica, os.environ["REPLICA_BUCKET"], check["prefix"])
            if replica
            else newest_dump(s3, bucket, check["prefix"])
        )
        if obj is None:
            problems.append(f"{label}: no dump found")
            continue
        age_h = (now - obj["LastModified"]).total_seconds() / 3600
        if age_h > check["max_age_hours"]:
            problems.append(f"{label}: newest dump is {age_h:.1f}h old (limit {check['max_age_hours']}h): {obj['Key']}")
        elif obj["Size"] < check["min_bytes"]:
            problems.append(f"{label}: newest dump is only {obj['Size']} bytes (minimum {check['min_bytes']}): {obj['Key']}")
    if problems:
        sns.publish(
            TopicArn=os.environ["TOPIC_ARN"],
            Subject="HASHPASS database backup problem",
            Message="Database backups need attention:\n\n" + "\n".join(problems)
            + "\n\nRunbook: apps/docs/docs/infra/database-backup-and-recovery.md",
        )
    print(json.dumps({"problems": problems}))
    return {"problems": problems}

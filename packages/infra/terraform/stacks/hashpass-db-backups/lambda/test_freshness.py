"""Run: python3 -m unittest packages/infra/terraform/stacks/hashpass-db-backups/lambda/test_freshness.py"""
import datetime
import os
import sys
import types
import unittest

os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-2")
sys.path.insert(0, os.path.dirname(__file__))
# These tests exercise pure freshness logic and use fake S3 clients below; do not
# require boto3 or credentials just to import the Lambda module.
boto3_stub = types.ModuleType("boto3")
boto3_stub.client = lambda *args, **kwargs: object()
sys.modules["boto3"] = boto3_stub
import freshness  # noqa: E402

NOW = datetime.datetime(2026, 10, 26, 22, 12, tzinfo=datetime.timezone.utc)
CORE = {"prefix": "prod/core/", "max_age_hours": 8, "min_bytes": 100_000}


def dump(hours_old, size=5_000_000, key="prod/core/core-prod_20261026T132230Z.dump"):
    return {"Key": key, "Size": size, "LastModified": NOW - datetime.timedelta(hours=hours_old)}


class FakePaginator:
    def __init__(self, objects):
        self.objects = objects

    def paginate(self, Bucket, Prefix):
        yield {"Contents": [obj for obj in self.objects if obj["Key"].startswith(Prefix)]}


class FakeS3:
    def __init__(self, objects):
        self.objects = objects

    def get_paginator(self, name):
        assert name == "list_objects_v2"
        return FakePaginator(self.objects)


class FreshnessMessageTest(unittest.TestCase):
    def test_healthy_dump_produces_no_problem(self):
        self.assertIsNone(freshness.evaluate(CORE, dump(5), NOW))

    def test_stale_dump_explains_age_limit_cause_and_fix(self):
        problem = freshness.evaluate(CORE, dump(8.8), NOW)
        self.assertEqual(problem["kind"], "stale")
        message = freshness.build_message([problem], NOW)
        self.assertIn("8.8 hours old", message)
        self.assertIn("must be under 8 hours", message)
        self.assertIn("0.8 hours overdue", message)
        self.assertIn("core-prod_20261026T132230Z.dump", message)
        self.assertIn("delayed or skipped a scheduled run", message)
        self.assertIn("--field target=core-production", message)
        self.assertIn("actions/workflows/db-backup.yml", message)
        self.assertIn("blob/main/apps/docs/docs/infra/database-backup-and-recovery.md", message)
        self.assertIn("have not failed outright", message)

    def test_missing_dump_is_called_out_as_nothing_to_restore(self):
        problem = freshness.evaluate(CORE, None, NOW)
        self.assertEqual(problem["kind"], "missing")
        message = freshness.build_message([problem], NOW)
        self.assertIn("nothing to restore from", message)
        self.assertNotIn("have not failed outright", message)

    def test_tiny_dump_is_reported_as_possibly_truncated(self):
        problem = freshness.evaluate(CORE, dump(1, size=2_048), NOW)
        self.assertEqual(problem["kind"], "small")
        self.assertIn("2,048 bytes", freshness.build_message([problem], NOW))

    def test_replica_lag_is_not_described_as_production_data_loss(self):
        problem = freshness.evaluate({**CORE, "replica": True, "max_age_hours": 12}, dump(13), NOW)
        text = freshness.describe(problem)
        self.assertIn("replica bucket", text)
        self.assertIn("replication", text)
        self.assertNotIn("you would lose everything", text)


class UnchangedBackupFreshnessTest(unittest.TestCase):
    def setUp(self):
        self.dump_key = "prod/core/core-prod_20261024T221200Z.dump"
        self.dump_obj = {
            "Key": self.dump_key,
            "Size": 5_000_000,
            "LastModified": NOW - datetime.timedelta(days=2),
        }
        self.marker_key = (
            "prod/core/_verification/core-prod_20261026T211200Z__"
            "core-prod_20261024T221200Z.dump.unchanged"
        )

    def marker(self, hours_old=1, size=250, dump_key=None):
        basename = (dump_key or self.dump_key).rsplit("/", 1)[-1]
        key = self.marker_key.split("__", 1)[0] + "__" + basename + ".unchanged"
        return {"Key": key, "Size": size, "LastModified": NOW - datetime.timedelta(hours=hours_old)}

    def test_recent_unchanged_marker_keeps_an_older_full_dump_fresh(self):
        selected = freshness.newest_backup_state(
            FakeS3([self.dump_obj, self.marker()]), "backup-bucket", "prod/core/", CORE["min_bytes"]
        )
        self.assertTrue(selected["verified_unchanged"])
        self.assertEqual(selected["Key"], self.dump_key)
        self.assertEqual(selected["LastModified"], NOW - datetime.timedelta(hours=1))
        self.assertIsNone(freshness.evaluate(CORE, selected, NOW))

    def test_marker_for_missing_dump_does_not_hide_a_stale_backup(self):
        orphan = self.marker(dump_key="prod/core/core-prod_20261001T000000Z.dump")
        selected = freshness.newest_backup_state(
            FakeS3([self.dump_obj, orphan]), "backup-bucket", "prod/core/", CORE["min_bytes"]
        )
        problem = freshness.evaluate(CORE, selected, NOW)
        self.assertEqual(problem["kind"], "stale")
        self.assertFalse(problem["verified_unchanged"])

    def test_marker_for_an_older_dump_cannot_override_a_newer_dump(self):
        newer_dump = dump(1, key="prod/core/core-prod_20261026T211200Z.dump")
        selected = freshness.newest_backup_state(
            FakeS3([self.dump_obj, newer_dump, self.marker()]), "backup-bucket", "prod/core/", CORE["min_bytes"]
        )
        self.assertEqual(selected["Key"], newer_dump["Key"])
        self.assertFalse(selected.get("verified_unchanged", False))
        self.assertIsNone(freshness.evaluate(CORE, selected, NOW))

    def test_stale_unchanged_marker_explains_full_dump_and_verification_age(self):
        selected = freshness.newest_backup_state(
            FakeS3([self.dump_obj, self.marker(hours_old=9)]), "backup-bucket", "prod/core/", CORE["min_bytes"]
        )
        problem = freshness.evaluate(CORE, selected, NOW)
        self.assertEqual(problem["kind"], "stale")
        self.assertTrue(problem["verified_unchanged"])
        message = freshness.build_message([problem], NOW)
        self.assertIn("unchanged-data verification is 9.0 hours old", message)
        self.assertIn(f"Last full dump: {self.dump_key}", message)
        self.assertIn(self.marker_key, message)

    def test_zero_byte_marker_and_tiny_dump_cannot_verify_freshness(self):
        small_dump = {**self.dump_obj, "Size": 99_999}
        selected = freshness.newest_backup_state(
            FakeS3([small_dump, self.marker(size=0)]), "backup-bucket", "prod/core/", CORE["min_bytes"]
        )
        self.assertFalse(selected.get("verified_unchanged", False))
        self.assertEqual(freshness.evaluate(CORE, selected, NOW)["kind"], "small")


if __name__ == "__main__":
    unittest.main()

"""Run: python3 -m unittest packages/infra/terraform/stacks/hashpass-db-backups/lambda/test_freshness.py"""
import datetime
import os
import sys
import unittest

os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-2")
sys.path.insert(0, os.path.dirname(__file__))
import freshness  # noqa: E402

NOW = datetime.datetime(2026, 10, 26, 22, 12, tzinfo=datetime.timezone.utc)
CORE = {"prefix": "prod/core/", "max_age_hours": 8, "min_bytes": 100_000}


def dump(hours_old, size=5_000_000, key="prod/core/core-prod_20261026T132230Z.dump"):
    return {"Key": key, "Size": size, "LastModified": NOW - datetime.timedelta(hours=hours_old)}


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


if __name__ == "__main__":
    unittest.main()

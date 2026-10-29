# Dedicated, private bucket for database dumps.
#
# Layout (one prefix per source database, never mixed):
#   prod/core/       core production  (fxgftanraszjjyeidvia)  - the only production database
#   prod/bsl-final/  BSL production   (mnnqryrdlhddorqsrtbn)  - frozen at the 2026-10-21 consolidation
#   dev/shared/      shared dev       (gsugeqozyeokncpbndna)
#
# Dumps contain user data. The bucket is private, encrypted, versioned, TLS-only,
# and has no automatic expiry of current objects: deleting a backup is a
# deliberate, reviewed action. Do not put Terraform state here (that lives in
# the separate hashpass-ops-backup bucket).

data "aws_caller_identity" "current" {}

locals {
  bucket_name = "${var.name_prefix}-${data.aws_caller_identity.current.account_id}-${var.aws_region}"
}

resource "aws_s3_bucket" "db_backups" {
  bucket = local.bucket_name

  lifecycle {
    prevent_destroy = true
  }

  tags = {
    Purpose   = "database-backups"
    DataClass = "contains-user-data"
    ManagedBy = "terraform"
    Stack     = "hashpass-db-backups"
  }
}

resource "aws_s3_bucket_public_access_block" "db_backups" {
  bucket                  = aws_s3_bucket.db_backups.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "db_backups" {
  bucket = aws_s3_bucket.db_backups.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "db_backups" {
  bucket = aws_s3_bucket.db_backups.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "db_backups" {
  bucket = aws_s3_bucket.db_backups.id

  rule {
    bucket_key_enabled = true

    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "db_backups" {
  bucket = aws_s3_bucket.db_backups.id

  depends_on = [aws_s3_bucket_versioning.db_backups]

  rule {
    id     = "archive-and-clean-old-versions"
    status = "Enabled"

    filter {}

    transition {
      days          = var.transition_to_glacier_ir_days
      storage_class = "GLACIER_IR"
    }

    noncurrent_version_expiration {
      noncurrent_days = var.noncurrent_version_expiration_days
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  # Retention tiers. db-backup.yml tags each upload `tier=<name>`; objects without
  # the tag (manual dumps, prod/bsl-final) match no tier rule and never expire.
  dynamic "rule" {
    for_each = var.retention_days
    content {
      id     = "retention-${rule.key}"
      status = "Enabled"

      filter {
        tag {
          key   = "tier"
          value = rule.key
        }
      }

      expiration {
        days = rule.value
      }

      noncurrent_version_expiration {
        noncurrent_days = 2
      }
    }
  }
}

# Tamper protection: new dumps cannot be deleted or overwritten for object_lock_days,
# even by an admin, without the explicit s3:BypassGovernanceRetention permission.
# GOVERNANCE (not COMPLIANCE) so a mistake stays recoverable. Enabling Object Lock
# on a bucket cannot be undone.
resource "aws_s3_bucket_object_lock_configuration" "db_backups" {
  bucket = aws_s3_bucket.db_backups.id

  rule {
    default_retention {
      mode = "GOVERNANCE"
      days = var.object_lock_days
    }
  }

  depends_on = [aws_s3_bucket_versioning.db_backups]
}

data "aws_iam_policy_document" "tls_only" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]

    resources = [
      aws_s3_bucket.db_backups.arn,
      "${aws_s3_bucket.db_backups.arn}/*",
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "db_backups" {
  bucket = aws_s3_bucket.db_backups.id
  policy = data.aws_iam_policy_document.tls_only.json

  depends_on = [aws_s3_bucket_public_access_block.db_backups]
}

# --- GitHub Actions access (OIDC, no long-lived keys) -----------------------
#
# Two roles with deliberately split powers:
#   writer - may only PutObject under prod/core/, prod/pre-migration/, and dev/shared/.
#            It cannot read, list, overwrite-by-delete, or touch prod/bsl-final/.
#   reader - may only read those prefixes plus prod/pre-migration/ (quarterly restore drill).
# The writer also trusts the production GitHub Environment subject used by
# pre-migration backups. Scheduled backups and restore drills keep their main
# branch subject; the reader remains restricted to main.

data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

data "aws_iam_policy_document" "github_writer_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${var.github_repository}:ref:refs/heads/main",
        "repo:${var.github_repository}:environment:production",
      ]
    }
  }
}

data "aws_iam_policy_document" "github_reader_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repository}:ref:refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "writer" {
  name               = "hashpass-db-backups-writer"
  assume_role_policy = data.aws_iam_policy_document.github_writer_assume.json
  tags               = { Purpose = "database-backups", ManagedBy = "terraform", Stack = "hashpass-db-backups" }
}

resource "aws_iam_role_policy" "writer" {
  name = "put-dumps-only"
  role = aws_iam_role.writer.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid    = "PutDumpsOnly"
      Effect = "Allow"
      Action = ["s3:PutObject", "s3:PutObjectTagging"]
      Resource = [
        "${aws_s3_bucket.db_backups.arn}/prod/core/*",
        "${aws_s3_bucket.db_backups.arn}/prod/pre-migration/*",
        "${aws_s3_bucket.db_backups.arn}/dev/shared/*",
      ]
    }]
  })
}

resource "aws_iam_role" "reader" {
  name               = "hashpass-db-backups-reader"
  assume_role_policy = data.aws_iam_policy_document.github_reader_assume.json
  tags               = { Purpose = "database-backups", ManagedBy = "terraform", Stack = "hashpass-db-backups" }
}

resource "aws_iam_role_policy" "reader" {
  name = "read-dumps-only"
  role = aws_iam_role.reader.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ReadDumps"
        Effect = "Allow"
        Action = ["s3:GetObject"]
        Resource = [
          "${aws_s3_bucket.db_backups.arn}/prod/core/*", "${aws_s3_bucket.db_backups.arn}/dev/shared/*",
          "${aws_s3_bucket.db_backups.arn}/prod/pre-migration/*",
          "${aws_s3_bucket.replica.arn}/prod/core/*", "${aws_s3_bucket.replica.arn}/dev/shared/*",
          "${aws_s3_bucket.replica.arn}/prod/pre-migration/*",
        ]
      },
      {
        Sid       = "ListDumpPrefixes"
        Effect    = "Allow"
        Action    = ["s3:ListBucket"]
        Resource  = [aws_s3_bucket.db_backups.arn, aws_s3_bucket.replica.arn]
        Condition = { StringLike = { "s3:prefix" = ["prod/core/*", "dev/shared/*", "prod/pre-migration/*"] } }
      }
    ]
  })
}

# --- Freshness alarm (independent of GitHub) --------------------------------
#
# Emails when the newest dump is too old or too small, or when this check itself
# fails. A dead GitHub schedule, a deleted secret and a revoked role all look the
# same from here: no new object.

resource "aws_sns_topic" "alerts" {
  name         = "hashpass-db-backups-alerts"
  display_name = "HASHPASS database backups"
  tags         = { Purpose = "database-backups", ManagedBy = "terraform", Stack = "hashpass-db-backups" }
}

resource "aws_sns_topic_subscription" "alert_email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

data "archive_file" "freshness" {
  type        = "zip"
  source_file = "${path.module}/lambda/freshness.py"
  output_path = "${path.module}/.build/freshness.zip"
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "freshness" {
  name               = "hashpass-db-backups-freshness"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
  tags               = { Purpose = "database-backups", ManagedBy = "terraform", Stack = "hashpass-db-backups" }
}

resource "aws_iam_role_policy" "freshness" {
  name = "list-dumps-and-alert"
  role = aws_iam_role.freshness.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "ListDumpMetadataOnly"
        Effect    = "Allow"
        Action    = ["s3:ListBucket"]
        Resource  = [aws_s3_bucket.db_backups.arn, aws_s3_bucket.replica.arn]
        Condition = { StringLike = { "s3:prefix" = ["prod/core/*", "dev/shared/*"] } }
      },
      {
        Sid      = "PublishAlert"
        Effect   = "Allow"
        Action   = ["sns:Publish"]
        Resource = aws_sns_topic.alerts.arn
      },
      {
        Sid      = "WriteOwnLogs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.freshness.arn}:*"
      }
    ]
  })
}

resource "aws_cloudwatch_log_group" "freshness" {
  name              = "/aws/lambda/hashpass-db-backups-freshness"
  retention_in_days = 30
}

resource "aws_lambda_function" "freshness" {
  function_name    = "hashpass-db-backups-freshness"
  role             = aws_iam_role.freshness.arn
  runtime          = "python3.12"
  handler          = "freshness.handler"
  filename         = data.archive_file.freshness.output_path
  source_code_hash = data.archive_file.freshness.output_base64sha256
  timeout          = 30
  memory_size      = 128

  environment {
    variables = {
      BUCKET    = aws_s3_bucket.db_backups.bucket
      TOPIC_ARN = aws_sns_topic.alerts.arn
      CHECKS = jsonencode([
        { prefix = "prod/core/", max_age_hours = var.core_max_age_hours, min_bytes = var.min_dump_bytes },
        { prefix = "dev/shared/", max_age_hours = var.dev_max_age_hours, min_bytes = var.min_dump_bytes },
        { prefix = "prod/core/", max_age_hours = var.replica_core_max_age_hours, min_bytes = var.min_dump_bytes, replica = true },
      ])
      REPLICA_BUCKET = aws_s3_bucket.replica.bucket
      REPLICA_REGION = var.replica_region
    }
  }

  depends_on = [aws_cloudwatch_log_group.freshness]
  tags       = { Purpose = "database-backups", ManagedBy = "terraform", Stack = "hashpass-db-backups" }
}

resource "aws_cloudwatch_event_rule" "freshness" {
  name                = "hashpass-db-backups-freshness"
  description         = "Check that database dumps are fresh."
  schedule_expression = "rate(2 hours)"
}

resource "aws_cloudwatch_event_target" "freshness" {
  rule = aws_cloudwatch_event_rule.freshness.name
  arn  = aws_lambda_function.freshness.arn
}

resource "aws_lambda_permission" "freshness" {
  statement_id  = "AllowEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.freshness.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.freshness.arn
}

# If the checker itself errors, nothing else would tell us.
resource "aws_cloudwatch_metric_alarm" "freshness_errors" {
  alarm_name          = "hashpass-db-backups-freshness-errors"
  alarm_description   = "The database backup freshness check failed to run."
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = aws_lambda_function.freshness.function_name }
  statistic           = "Sum"
  period              = 7200
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "breaching" # no invocation at all is also a failure
  alarm_actions       = [aws_sns_topic.alerts.arn]
}

# --- Cross-region replica ----------------------------------------------------
#
# Same account, different region: protects against losing us-east-2 (and against
# a bad delete in the primary, because delete markers are NOT replicated). It does
# not protect against compromise of this AWS account; a cross-account copy needs a
# second account and is not built. Only objects written after replication was
# enabled are replicated automatically.

locals {
  replica_bucket_name = "${var.name_prefix}-replica-${data.aws_caller_identity.current.account_id}-${var.replica_region}"
}

resource "aws_s3_bucket" "replica" {
  provider = aws.replica
  bucket   = local.replica_bucket_name

  lifecycle {
    prevent_destroy = true
  }

  tags = {
    Purpose   = "database-backups-replica"
    DataClass = "contains-user-data"
    ManagedBy = "terraform"
    Stack     = "hashpass-db-backups"
  }
}

resource "aws_s3_bucket_public_access_block" "replica" {
  provider                = aws.replica
  bucket                  = aws_s3_bucket.replica.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "replica" {
  provider = aws.replica
  bucket   = aws_s3_bucket.replica.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "replica" {
  provider = aws.replica
  bucket   = aws_s3_bucket.replica.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "replica" {
  provider = aws.replica
  bucket   = aws_s3_bucket.replica.id

  rule {
    bucket_key_enabled = true

    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_object_lock_configuration" "replica" {
  provider = aws.replica
  bucket   = aws_s3_bucket.replica.id

  rule {
    default_retention {
      mode = "GOVERNANCE"
      days = var.object_lock_days
    }
  }

  depends_on = [aws_s3_bucket_versioning.replica]
}

# Delete markers are not replicated, so the replica needs its own expiry. Same
# tiers as the primary; replicated objects keep their `tier` tag.
resource "aws_s3_bucket_lifecycle_configuration" "replica" {
  provider = aws.replica
  bucket   = aws_s3_bucket.replica.id

  depends_on = [aws_s3_bucket_versioning.replica]

  rule {
    id     = "clean-old-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = var.noncurrent_version_expiration_days
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  dynamic "rule" {
    for_each = var.retention_days
    content {
      id     = "retention-${rule.key}"
      status = "Enabled"

      filter {
        tag {
          key   = "tier"
          value = rule.key
        }
      }

      expiration {
        days = rule.value
      }

      noncurrent_version_expiration {
        noncurrent_days = 2
      }
    }
  }
}

data "aws_iam_policy_document" "replica_tls_only" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]

    resources = [
      aws_s3_bucket.replica.arn,
      "${aws_s3_bucket.replica.arn}/*",
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "replica" {
  provider = aws.replica
  bucket   = aws_s3_bucket.replica.id
  policy   = data.aws_iam_policy_document.replica_tls_only.json

  depends_on = [aws_s3_bucket_public_access_block.replica]
}

data "aws_iam_policy_document" "s3_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["s3.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "replication" {
  name               = "hashpass-db-backups-replication"
  assume_role_policy = data.aws_iam_policy_document.s3_assume.json
  tags               = { Purpose = "database-backups", ManagedBy = "terraform", Stack = "hashpass-db-backups" }
}

resource "aws_iam_role_policy" "replication" {
  name = "replicate-dumps"
  role = aws_iam_role.replication.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetReplicationConfiguration", "s3:ListBucket"]
        Resource = aws_s3_bucket.db_backups.arn
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObjectVersionForReplication", "s3:GetObjectVersionAcl", "s3:GetObjectVersionTagging", "s3:GetObjectRetention", "s3:GetObjectLegalHold"]
        Resource = "${aws_s3_bucket.db_backups.arn}/*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ReplicateObject", "s3:ReplicateTags"]
        Resource = "${aws_s3_bucket.replica.arn}/*"
      }
    ]
  })
}

resource "aws_s3_bucket_replication_configuration" "db_backups" {
  bucket = aws_s3_bucket.db_backups.id
  role   = aws_iam_role.replication.arn

  depends_on = [
    aws_s3_bucket_versioning.db_backups,
    aws_s3_bucket_versioning.replica,
    aws_s3_bucket_object_lock_configuration.db_backups,
    aws_s3_bucket_object_lock_configuration.replica,
    aws_iam_role_policy.replication,
  ]

  rule {
    id     = "replicate-all-dumps"
    status = "Enabled"

    filter {}

    delete_marker_replication {
      status = "Disabled"
    }

    destination {
      bucket = aws_s3_bucket.replica.arn
    }
  }
}

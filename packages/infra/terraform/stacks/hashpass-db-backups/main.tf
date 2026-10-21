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
#   writer - may only PutObject under prod/core/ and dev/shared/ (nightly dumps).
#            It cannot read, list, overwrite-by-delete, or touch prod/bsl-final/.
#   reader - may only read those prefixes (quarterly restore drill).
# Both trust only workflows running on this repository's main branch (scheduled
# workflows always run there).

data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

data "aws_iam_policy_document" "github_assume" {
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
  assume_role_policy = data.aws_iam_policy_document.github_assume.json
  tags               = { Purpose = "database-backups", ManagedBy = "terraform", Stack = "hashpass-db-backups" }
}

resource "aws_iam_role_policy" "writer" {
  name = "put-dumps-only"
  role = aws_iam_role.writer.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid      = "PutDumpsOnly"
      Effect   = "Allow"
      Action   = ["s3:PutObject"]
      Resource = ["${aws_s3_bucket.db_backups.arn}/prod/core/*", "${aws_s3_bucket.db_backups.arn}/dev/shared/*"]
    }]
  })
}

resource "aws_iam_role" "reader" {
  name               = "hashpass-db-backups-reader"
  assume_role_policy = data.aws_iam_policy_document.github_assume.json
  tags               = { Purpose = "database-backups", ManagedBy = "terraform", Stack = "hashpass-db-backups" }
}

resource "aws_iam_role_policy" "reader" {
  name = "read-dumps-only"
  role = aws_iam_role.reader.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ReadDumps"
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = ["${aws_s3_bucket.db_backups.arn}/prod/core/*", "${aws_s3_bucket.db_backups.arn}/dev/shared/*"]
      },
      {
        Sid       = "ListDumpPrefixes"
        Effect    = "Allow"
        Action    = ["s3:ListBucket"]
        Resource  = aws_s3_bucket.db_backups.arn
        Condition = { StringLike = { "s3:prefix" = ["prod/core/*", "dev/shared/*"] } }
      }
    ]
  })
}

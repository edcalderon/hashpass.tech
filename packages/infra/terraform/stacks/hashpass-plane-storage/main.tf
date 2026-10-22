data "aws_caller_identity" "current" {}

locals {
  bucket_name = "${var.name_prefix}-${data.aws_caller_identity.current.account_id}-${var.aws_region}"
  tags = merge(var.tags, {
    ManagedBy          = "terraform"
    Project            = "hashpass-self-hosted"
    Purpose            = "plane-private-object-storage"
    DataClassification = "confidential"
  })
}

resource "aws_s3_bucket" "plane" {
  bucket = local.bucket_name
  tags   = local.tags
}

resource "aws_s3_bucket_public_access_block" "plane" {
  bucket                  = aws_s3_bucket.plane.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "plane" {
  bucket = aws_s3_bucket.plane.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "plane" {
  bucket = aws_s3_bucket.plane.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "plane" {
  bucket = aws_s3_bucket.plane.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "plane" {
  bucket = aws_s3_bucket.plane.id

  rule {
    id     = "expire-noncurrent-object-versions"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 30
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

resource "aws_s3_bucket_cors_configuration" "plane" {
  bucket = aws_s3_bucket.plane.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD", "POST", "PUT"]
    allowed_origins = [var.work_origin]
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}

resource "aws_iam_user" "plane_storage" {
  name = var.name_prefix
  tags = local.tags
}

data "aws_iam_policy_document" "plane_storage" {
  statement {
    sid = "ListPrivatePlaneBucket"
    actions = [
      "s3:GetBucketLocation",
      "s3:ListBucket",
      "s3:ListBucketMultipartUploads",
    ]
    resources = [aws_s3_bucket.plane.arn]
  }

  statement {
    sid = "ManagePrivatePlaneObjects"
    actions = [
      "s3:AbortMultipartUpload",
      "s3:DeleteObject",
      "s3:GetObject",
      "s3:ListMultipartUploadParts",
      "s3:PutObject",
    ]
    resources = ["${aws_s3_bucket.plane.arn}/*"]
  }
}

resource "aws_iam_user_policy" "plane_storage" {
  name   = "${var.name_prefix}-bucket-only"
  user   = aws_iam_user.plane_storage.name
  policy = data.aws_iam_policy_document.plane_storage.json
}

resource "aws_iam_access_key" "plane_storage" {
  user = aws_iam_user.plane_storage.name
}

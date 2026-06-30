data "aws_caller_identity" "current" {}

locals {
  site_bucket_name     = try(trimspace(var.site_bucket_name), "") == "" ? "${var.name_prefix}-${var.environment}-site-${data.aws_caller_identity.current.account_id}-${var.aws_region}" : trimspace(var.site_bucket_name)
  artifact_bucket_name = try(trimspace(var.artifact_bucket_name), "") == "" ? "${var.name_prefix}-${var.environment}-pipelines-${data.aws_caller_identity.current.account_id}-${var.aws_region}" : trimspace(var.artifact_bucket_name)
  site_origin_id       = "${local.site_bucket_name}-origin"
  pipeline_name        = "${var.name_prefix}-${var.environment}-site"
  codebuild_name       = "${var.name_prefix}-${var.environment}-site-build"
  tags = merge(var.tags, {
    Environment = var.environment
    ManagedBy   = "terraform"
    Service     = "static-site-pipeline"
  })
}

check "connection_arn_required" {
  assert {
    condition     = trimspace(var.connection_arn) != ""
    error_message = "connection_arn is required for the site pipeline module."
  }
}

resource "aws_s3_bucket" "site" {
  bucket        = local.site_bucket_name
  force_destroy = false
  tags          = local.tags
}

resource "aws_s3_bucket_ownership_controls" "site" {
  bucket = aws_s3_bucket.site.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "site" {
  bucket                  = aws_s3_bucket.site.id
  block_public_acls       = true
  block_public_policy     = var.enable_cloudfront
  ignore_public_acls      = true
  restrict_public_buckets = var.enable_cloudfront
}

resource "aws_s3_bucket_versioning" "site" {
  bucket = aws_s3_bucket.site.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "site" {
  bucket = aws_s3_bucket.site.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_website_configuration" "site" {
  count  = var.enable_cloudfront ? 0 : 1
  bucket = aws_s3_bucket.site.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html"
  }
}

resource "aws_cloudfront_origin_access_control" "site" {
  count                             = var.enable_cloudfront ? 1 : 0
  name                              = "${local.site_bucket_name}-oac"
  description                       = "Origin access control for ${local.site_bucket_name}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "site" {
  count               = var.enable_cloudfront ? 1 : 0
  enabled             = true
  comment             = "${var.name_prefix} ${var.environment} static site"
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  is_ipv6_enabled     = true
  wait_for_deployment = true

  origin {
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_id                = local.site_origin_id
    origin_access_control_id = aws_cloudfront_origin_access_control.site[0].id
  }

  default_cache_behavior {
    target_origin_id       = local.site_origin_id
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD", "OPTIONS"]
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false

      cookies {
        forward = "none"
      }
    }
  }

  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }

  tags = local.tags
}

data "aws_iam_policy_document" "site_bucket_cloudfront" {
  count = var.enable_cloudfront ? 1 : 0

  statement {
    sid = "AllowCloudFrontRead"

    actions = ["s3:GetObject"]
    resources = [
      "${aws_s3_bucket.site.arn}/*"
    ]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.site[0].arn]
    }
  }
}

resource "aws_s3_bucket_policy" "site_cloudfront" {
  count  = var.enable_cloudfront ? 1 : 0
  bucket = aws_s3_bucket.site.id
  policy = data.aws_iam_policy_document.site_bucket_cloudfront[0].json
}

resource "aws_s3_bucket_policy" "site_public" {
  count  = var.enable_cloudfront ? 0 : 1
  bucket = aws_s3_bucket.site.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowPublicRead"
        Effect    = "Allow"
        Principal = "*"
        Action    = ["s3:GetObject"]
        Resource  = "${aws_s3_bucket.site.arn}/*"
      }
    ]
  })

  # Ensure the bucket public access block has been relaxed before attaching the
  # public read policy. Without this ordering Terraform can race the policy
  # update and AWS rejects the create request.
  depends_on = [aws_s3_bucket_public_access_block.site]
}

resource "aws_s3_bucket" "artifacts" {
  bucket        = local.artifact_bucket_name
  force_destroy = false
  tags          = local.tags
}

resource "aws_s3_bucket_ownership_controls" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "artifacts" {
  bucket                  = aws_s3_bucket.artifacts.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "artifacts" {
  bucket = aws_s3_bucket.artifacts.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

data "aws_iam_policy_document" "codebuild_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["codebuild.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "codebuild" {
  name               = "${local.codebuild_name}-role"
  assume_role_policy = data.aws_iam_policy_document.codebuild_assume_role.json
  tags               = local.tags
}

data "aws_iam_policy_document" "codebuild_permissions" {
  statement {
    sid = "ArtifactBucketAccess"
    actions = [
      "s3:GetBucketLocation",
      "s3:GetObject",
      "s3:GetObjectVersion",
      "s3:ListBucket",
      "s3:PutObject",
      "s3:DeleteObject",
    ]
    resources = [
      aws_s3_bucket.artifacts.arn,
      "${aws_s3_bucket.artifacts.arn}/*",
    ]
  }

  statement {
    sid = "SiteBucketAccess"
    actions = [
      "s3:GetBucketLocation",
      "s3:GetObject",
      "s3:ListBucket",
      "s3:PutObject",
      "s3:DeleteObject",
    ]
    resources = [
      aws_s3_bucket.site.arn,
      "${aws_s3_bucket.site.arn}/*",
    ]
  }

  dynamic "statement" {
    for_each = var.enable_cloudfront ? [1] : []

    content {
      sid = "CloudFrontInvalidation"
      actions = [
        "cloudfront:CreateInvalidation",
        "cloudfront:GetDistribution",
        "cloudfront:GetDistributionConfig",
      ]
      resources = [aws_cloudfront_distribution.site[0].arn]
    }
  }

  statement {
    sid = "Logs"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "codebuild" {
  name   = "${local.codebuild_name}-policy"
  role   = aws_iam_role.codebuild.id
  policy = data.aws_iam_policy_document.codebuild_permissions.json
}

resource "aws_codebuild_project" "site" {
  name          = local.codebuild_name
  description   = "Build and deploy the HashPass web site to S3/CloudFront"
  service_role  = aws_iam_role.codebuild.arn
  build_timeout = var.build_timeout
  badge_enabled = false

  source {
    type      = "CODEPIPELINE"
    buildspec = var.buildspec_path
  }

  artifacts {
    type = "CODEPIPELINE"
  }

  environment {
    compute_type                = var.build_compute_type
    image                       = var.build_image
    type                        = "LINUX_CONTAINER"
    image_pull_credentials_type = "CODEBUILD"
    privileged_mode             = false

    dynamic "environment_variable" {
      for_each = merge({
        AWS_DEFAULT_REGION = var.aws_region
        AWS_REGION         = var.aws_region
        BUILD_ENV          = var.environment
        CI                 = "1"
        SITE_BUCKET_NAME   = aws_s3_bucket.site.bucket
        TARGET_STAGE       = var.environment
        }, var.enable_cloudfront ? {
        SITE_CLOUDFRONT_DISTRIBUTION_ID = aws_cloudfront_distribution.site[0].id
        SITE_CLOUDFRONT_DOMAIN_NAME     = aws_cloudfront_distribution.site[0].domain_name
      } : {}, var.build_environment)

      content {
        name  = environment_variable.key
        value = environment_variable.value
        type  = "PLAINTEXT"
      }
    }
  }

  cache {
    type     = "S3"
    location = "${aws_s3_bucket.artifacts.bucket}/codebuild-cache"
  }

  tags = local.tags
}

data "aws_iam_policy_document" "codepipeline_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["codepipeline.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "codepipeline" {
  name               = "${local.pipeline_name}-role"
  assume_role_policy = data.aws_iam_policy_document.codepipeline_assume_role.json
  tags               = local.tags
}

data "aws_iam_policy_document" "codepipeline_permissions" {
  statement {
    sid = "ArtifactBucketAccess"
    actions = [
      "s3:GetBucketLocation",
      "s3:GetBucketVersioning",
      "s3:GetObject",
      "s3:GetObjectVersion",
      "s3:ListBucket",
      "s3:PutObject",
    ]
    resources = [
      aws_s3_bucket.artifacts.arn,
      "${aws_s3_bucket.artifacts.arn}/*",
    ]
  }

  statement {
    sid = "UseConnection"
    actions = [
      "codestar-connections:UseConnection",
    ]
    resources = [var.connection_arn]
  }

  statement {
    sid = "InvokeCodeBuild"
    actions = [
      "codebuild:BatchGetBuilds",
      "codebuild:StartBuild",
    ]
    resources = [aws_codebuild_project.site.arn]
  }

  statement {
    sid = "PassCodeBuildRole"
    actions = [
      "iam:PassRole",
    ]
    resources = [aws_iam_role.codebuild.arn]
  }
}

resource "aws_iam_role_policy" "codepipeline" {
  name   = "${local.pipeline_name}-policy"
  role   = aws_iam_role.codepipeline.id
  policy = data.aws_iam_policy_document.codepipeline_permissions.json
}

resource "aws_codepipeline" "site" {
  name     = local.pipeline_name
  role_arn = aws_iam_role.codepipeline.arn

  artifact_store {
    location = aws_s3_bucket.artifacts.bucket
    type     = "S3"
  }

  stage {
    name = "Source"

    action {
      name             = "Source"
      category         = "Source"
      owner            = "AWS"
      provider         = "CodeStarSourceConnection"
      version          = "1"
      output_artifacts = ["SourceArtifact"]

      configuration = {
        ConnectionArn        = var.connection_arn
        FullRepositoryId     = var.repository
        BranchName           = var.branch_name
        OutputArtifactFormat = "CODE_ZIP"
      }
    }
  }

  stage {
    name = "Build"

    action {
      name            = "DeploySite"
      category        = "Build"
      owner           = "AWS"
      provider        = "CodeBuild"
      version         = "1"
      input_artifacts = ["SourceArtifact"]

      configuration = {
        ProjectName = aws_codebuild_project.site.name
      }
    }
  }

  tags = local.tags
}

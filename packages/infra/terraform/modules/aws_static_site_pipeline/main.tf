data "aws_caller_identity" "current" {}

locals {
  site_bucket_name           = try(trimspace(var.site_bucket_name), "") == "" ? "${var.name_prefix}-${var.environment}-site-${data.aws_caller_identity.current.account_id}-${var.aws_region}" : trimspace(var.site_bucket_name)
  artifact_bucket_name       = try(trimspace(var.artifact_bucket_name), "") == "" ? "${var.name_prefix}-${var.environment}-pipelines-${data.aws_caller_identity.current.account_id}-${var.aws_region}" : trimspace(var.artifact_bucket_name)
  site_origin_id             = "${local.site_bucket_name}-origin"
  pipeline_name              = "${var.name_prefix}-${var.environment}-site"
  build_action_provider_name = trimspace(var.build_action_provider_name)
  build_action_version       = trimspace(var.build_action_version)
  deploy_mode                = lower(trimspace(var.deploy_mode))
  custom_domain_name         = trimspace(var.custom_domain_name)
  acm_certificate_arn        = trimspace(var.acm_certificate_arn)
  cloudfront_aliases         = local.custom_domain_name != "" ? [local.custom_domain_name] : []
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

check "custom_domain_requires_certificate" {
  assert {
    condition = (
      local.custom_domain_name == "" && local.acm_certificate_arn == ""
      ) || (
      local.custom_domain_name != "" && local.acm_certificate_arn != ""
    )
    error_message = "custom_domain_name and acm_certificate_arn must be set together for CloudFront custom domains."
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
  aliases             = local.cloudfront_aliases
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
    acm_certificate_arn            = local.acm_certificate_arn != "" ? local.acm_certificate_arn : null
    cloudfront_default_certificate = local.acm_certificate_arn == ""
    ssl_support_method             = local.acm_certificate_arn != "" ? "sni-only" : null
    minimum_protocol_version       = local.acm_certificate_arn != "" ? "TLSv1.2_2021" : null
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
    sid = "SiteBucketAccess"
    actions = [
      "s3:GetBucketLocation",
      "s3:GetObject",
      "s3:GetObjectVersion",
      "s3:ListBucket",
      "s3:PutObject",
      "s3:DeleteObject",
    ]
    resources = [
      aws_s3_bucket.site.arn,
      "${aws_s3_bucket.site.arn}/*",
    ]
  }

  statement {
    sid = "UseConnection"
    actions = [
      "codestar-connections:UseConnection",
    ]
    resources = [var.connection_arn]
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
      name             = "BuildSite"
      category         = "Build"
      owner            = "Custom"
      provider         = local.build_action_provider_name
      version          = local.build_action_version
      input_artifacts  = ["SourceArtifact"]
      output_artifacts = ["BuildArtifact"]

      configuration = merge(
        {
          BuildScript     = var.build_script_path
          OutputDirectory = var.build_output_directory
          BuildEnvironmentJson = jsonencode(merge({
            AWS_DEFAULT_REGION = var.aws_region
            AWS_REGION         = var.aws_region
            BUILD_ENV          = var.environment
            CI                 = "1"
            TARGET_STAGE       = var.environment
          }, var.build_environment))
        },
        local.deploy_mode == "direct" ? merge(
          {
            # Direct deployments keep the existing S3 sync and cache-control
            # flow alive on the EC2 worker while artifact mode can hand off to
            # the optional S3 deploy action below.
            DeployScript     = var.deploy_script_path
            DeployBucketName = aws_s3_bucket.site.bucket
          },
          var.enable_cloudfront ? {
            DeployCloudFrontDistributionId = aws_cloudfront_distribution.site[0].id
          } : {}
        ) : {}
      )
    }
  }

  dynamic "stage" {
    for_each = local.deploy_mode == "artifact" ? [1] : []

    content {
      name = "Deploy"

      action {
        name            = "DeploySite"
        category        = "Deploy"
        owner           = "AWS"
        provider        = "S3"
        version         = "1"
        input_artifacts = ["BuildArtifact"]

        configuration = {
          BucketName = aws_s3_bucket.site.bucket
          Extract    = "true"
        }
      }
    }
  }

  tags = local.tags
}

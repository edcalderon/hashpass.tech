locals {
  site_bucket_name                  = try(trimspace(var.site_bucket_name), "") == "" ? "${var.name_prefix}-${var.environment}-site-${var.account_id}-${var.aws_region}" : trimspace(var.site_bucket_name)
  artifact_bucket_name              = try(trimspace(var.artifact_bucket_name), "") == "" ? "${var.name_prefix}-${var.environment}-pipelines-${var.account_id}-${var.aws_region}" : trimspace(var.artifact_bucket_name)
  site_origin_id                    = "${local.site_bucket_name}-origin"
  pipeline_name                     = "${var.name_prefix}-${var.environment}-site"
  build_action_provider_name        = trimspace(var.build_action_provider_name)
  build_action_version              = trimspace(var.build_action_version)
  build_execution_mode              = lower(trimspace(var.build_execution_mode))
  codebuild_project_name            = trimspace(var.codebuild_project_name) != "" ? trimspace(var.codebuild_project_name) : "${local.pipeline_name}-build"
  deploy_mode                       = lower(trimspace(var.deploy_mode))
  custom_domain_name                = trimspace(var.custom_domain_name)
  acm_certificate_arn               = trimspace(var.acm_certificate_arn)
  deploy_cloudfront_distribution_id = trimspace(var.deploy_cloudfront_distribution_id)
  deploy_cloudfront_domain_name     = trimspace(var.deploy_cloudfront_domain_name)
  cloudfront_aliases                = local.custom_domain_name != "" ? [local.custom_domain_name] : []
  deploy_cloudfront_action_configuration = merge(
    local.deploy_cloudfront_distribution_id != "" ? {
      DeployCloudFrontDistributionId = local.deploy_cloudfront_distribution_id
    } : {},
    local.deploy_cloudfront_domain_name != "" ? {
      DeployCloudFrontDomainName = local.deploy_cloudfront_domain_name
    } : {},
  )
  deploy_direct_action_configuration = merge(
    {
      DeployScript     = var.deploy_script_path
      DeployBucketName = local.site_bucket_name
    },
    local.deploy_cloudfront_action_configuration,
  )
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

  dynamic "statement" {
    for_each = local.build_execution_mode == "codebuild" ? [1] : []

    content {
      sid       = "CodeBuild"
      actions   = ["codebuild:BatchGetBuilds", "codebuild:StartBuild", "codebuild:StopBuild"]
      resources = [try(aws_codebuild_project.site[0].arn, "")]
    }
  }
}

resource "aws_iam_role_policy" "codepipeline" {
  name   = "${local.pipeline_name}-policy"
  role   = aws_iam_role.codepipeline.id
  policy = data.aws_iam_policy_document.codepipeline_permissions.json
}

data "aws_iam_policy_document" "codebuild_assume_role" {
  count = local.build_execution_mode == "codebuild" ? 1 : 0

  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["codebuild.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "codebuild" {
  count              = local.build_execution_mode == "codebuild" ? 1 : 0
  name               = "${local.pipeline_name}-codebuild-role"
  assume_role_policy = data.aws_iam_policy_document.codebuild_assume_role[0].json
  tags               = local.tags
}

data "aws_iam_policy_document" "codebuild_permissions" {
  count = local.build_execution_mode == "codebuild" ? 1 : 0

  statement {
    sid = "Logs"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = [
      "arn:aws:logs:${var.aws_region}:${var.account_id}:log-group:/aws/codebuild/${local.codebuild_project_name}",
      "arn:aws:logs:${var.aws_region}:${var.account_id}:log-group:/aws/codebuild/${local.codebuild_project_name}:*",
    ]
  }

  statement {
    sid = "PipelineArtifacts"
    actions = [
      "s3:GetBucketLocation",
      "s3:ListBucket",
      "s3:GetObject",
      "s3:GetObjectVersion",
      "s3:PutObject",
      "s3:PutObjectAcl",
    ]
    resources = [aws_s3_bucket.artifacts.arn, "${aws_s3_bucket.artifacts.arn}/*"]
  }

  statement {
    sid = "SiteDeployment"
    actions = [
      "s3:DeleteObject",
      "s3:GetBucketLocation",
      "s3:GetObject",
      "s3:ListBucket",
      "s3:PutObject",
      "s3:PutObjectAcl",
    ]
    resources = [aws_s3_bucket.site.arn, "${aws_s3_bucket.site.arn}/*"]
  }

  statement {
    sid       = "CloudFrontInvalidation"
    actions   = ["cloudfront:CreateInvalidation", "cloudfront:GetDistribution", "cloudfront:ListDistributions"]
    resources = ["*"]
  }

  dynamic "statement" {
    for_each = length(var.codebuild_lambda_function_arns) > 0 ? [1] : []

    content {
      sid       = "LambdaDeployment"
      actions   = ["lambda:GetFunction", "lambda:GetFunctionConfiguration", "lambda:UpdateFunctionCode"]
      resources = var.codebuild_lambda_function_arns
    }
  }
}

resource "aws_iam_role_policy" "codebuild" {
  count  = local.build_execution_mode == "codebuild" ? 1 : 0
  name   = "${local.pipeline_name}-codebuild-policy"
  role   = aws_iam_role.codebuild[0].id
  policy = data.aws_iam_policy_document.codebuild_permissions[0].json
}

resource "aws_codebuild_project" "site" {
  count = local.build_execution_mode == "codebuild" ? 1 : 0

  name          = local.codebuild_project_name
  description   = "On-demand ${var.environment} HashPass static site build"
  service_role  = aws_iam_role.codebuild[0].arn
  build_timeout = var.build_action_timeout

  artifacts {
    type = "CODEPIPELINE"
  }

  environment {
    compute_type                = var.codebuild_compute_type
    image                       = var.codebuild_image
    type                        = "LINUX_CONTAINER"
    image_pull_credentials_type = "CODEBUILD"

    dynamic "environment_variable" {
      for_each = merge(var.build_environment, {
        AWS_DEFAULT_REGION              = var.aws_region
        AWS_REGION                      = var.aws_region
        BUILD_ENV                       = var.environment
        BUILD_SCRIPT_PATH               = var.build_script_path
        DEPLOY_MODE                     = local.deploy_mode
        DEPLOY_SCRIPT_PATH              = var.deploy_script_path
        SITE_BUILD_DIR                  = var.build_output_directory
        SITE_BUCKET_NAME                = local.site_bucket_name
        SITE_CLOUDFRONT_DOMAIN_NAME     = var.deploy_cloudfront_domain_name
        SITE_CLOUDFRONT_DISTRIBUTION_ID = var.deploy_cloudfront_distribution_id
        CI                              = "1"
      })

      content {
        name  = environment_variable.key
        value = environment_variable.value
        type  = "PLAINTEXT"
      }
    }
  }

  source {
    type      = "CODEPIPELINE"
    buildspec = "packages/tools/buildspecs/hashpass-static-site.yml"
  }

  logs_config {
    cloudwatch_logs {
      group_name  = "/aws/codebuild/${local.codebuild_project_name}"
      stream_name = "build"
    }
  }

  tags = local.tags
}

resource "aws_codepipeline" "site" {
  name          = local.pipeline_name
  role_arn      = aws_iam_role.codepipeline.arn
  pipeline_type = var.enable_path_filtered_trigger ? "V2" : "V1"

  artifact_store {
    location = aws_s3_bucket.artifacts.bucket
    type     = "S3"
  }

  dynamic "trigger" {
    for_each = var.enable_path_filtered_trigger ? [1] : []

    content {
      provider_type = "CodeStarSourceConnection"

      git_configuration {
        source_action_name = "Source"

        push {
          branches {
            includes = [var.branch_name]
          }

          file_paths {
            includes = var.trigger_path_includes
            excludes = var.trigger_path_excludes
          }
        }
      }
    }
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
      owner            = local.build_execution_mode == "codebuild" ? "AWS" : "Custom"
      provider         = local.build_execution_mode == "codebuild" ? "CodeBuild" : local.build_action_provider_name
      version          = local.build_execution_mode == "codebuild" ? "1" : local.build_action_version
      input_artifacts  = ["SourceArtifact"]
      output_artifacts = ["BuildArtifact"]

      configuration = local.build_execution_mode == "codebuild" ? {
        ProjectName = aws_codebuild_project.site[0].name
        } : merge(
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
        local.deploy_mode == "direct" ? local.deploy_direct_action_configuration : {}
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

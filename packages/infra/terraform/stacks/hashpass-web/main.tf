data "aws_caller_identity" "current" {}

locals {
  build_site_bucket_name     = try(trimspace(var.site_bucket_name), "") != "" ? trimspace(var.site_bucket_name) : "${var.name_prefix}-${var.environment}-site-${data.aws_caller_identity.current.account_id}-${var.aws_region}"
  build_dev_site_bucket_name = try(trimspace(var.dev_site_bucket_name), "") != "" ? trimspace(var.dev_site_bucket_name) : "${var.name_prefix}-${var.dev_environment}-site-${data.aws_caller_identity.current.account_id}-${var.aws_region}"
  site_custom_domain_name    = trimspace(var.site_custom_domain_name)
  site_acm_certificate_arn   = trimspace(var.site_acm_certificate_arn)
  site_route53_zone_name     = trim(var.site_route53_zone_name, ".")
  site_route53_a_records = [
    for ip_address in var.site_route53_a_records : trimspace(ip_address)
    if trimspace(ip_address) != ""
  ]
  dev_route53_zone_name  = trim(var.dev_route53_zone_name, ".")
  dev_custom_domain_name = trimspace(var.dev_custom_domain_name)
  dev_route53_a_records = [
    for ip_address in var.dev_route53_a_records : trimspace(ip_address)
    if trimspace(ip_address) != ""
  ]

  build_worker_deploy_bucket_names = distinct([
    for bucket_name in [local.build_site_bucket_name, local.build_dev_site_bucket_name] :
    bucket_name if bucket_name != ""
  ])
  build_worker_artifact_bucket_names = distinct([
    for environment in [var.environment, var.dev_environment] :
    "${var.name_prefix}-${environment}-pipelines-${data.aws_caller_identity.current.account_id}-${var.aws_region}"
  ])

  build_environment = merge(
    {
      EXPO_PUBLIC_SUPABASE_URL           = var.supabase_url
      EXPO_PUBLIC_SUPABASE_URL_PROD      = var.supabase_url
      EXPO_PUBLIC_SUPABASE_KEY           = var.supabase_key
      EXPO_PUBLIC_SUPABASE_KEY_PROD      = var.supabase_key
      EXPO_PUBLIC_SUPABASE_ANON_KEY      = var.supabase_key
      EXPO_PUBLIC_SUPABASE_ANON_KEY_PROD = var.supabase_key
    },
    trimspace(var.google_client_id) != "" ? {
      GOOGLE_CLIENT_ID             = trimspace(var.google_client_id)
      BETTER_AUTH_GOOGLE_CLIENT_ID = trimspace(var.google_client_id)
    } : {},
    var.build_environment_overrides
  )

  dev_build_environment = merge(
    {
      EXPO_PUBLIC_SUPABASE_URL          = trimspace(var.supabase_url_dev) != "" ? var.supabase_url_dev : var.supabase_url
      EXPO_PUBLIC_SUPABASE_URL_DEV      = trimspace(var.supabase_url_dev) != "" ? var.supabase_url_dev : var.supabase_url
      EXPO_PUBLIC_SUPABASE_KEY          = trimspace(var.supabase_key_dev) != "" ? var.supabase_key_dev : var.supabase_key
      EXPO_PUBLIC_SUPABASE_KEY_DEV      = trimspace(var.supabase_key_dev) != "" ? var.supabase_key_dev : var.supabase_key
      EXPO_PUBLIC_SUPABASE_ANON_KEY     = trimspace(var.supabase_key_dev) != "" ? var.supabase_key_dev : var.supabase_key
      EXPO_PUBLIC_SUPABASE_ANON_KEY_DEV = trimspace(var.supabase_key_dev) != "" ? var.supabase_key_dev : var.supabase_key
    },
    trimspace(var.google_client_id) != "" ? {
      GOOGLE_CLIENT_ID             = trimspace(var.google_client_id)
      BETTER_AUTH_GOOGLE_CLIENT_ID = trimspace(var.google_client_id)
    } : {},
    var.build_environment_overrides
  )
}

check "required_inputs" {
  assert {
    condition     = trimspace(var.connection_arn) != ""
    error_message = "connection_arn is required."
  }
}

check "site_cloudfront_inputs" {
  assert {
    condition = (
      !var.enable_cloudfront
      || (local.site_custom_domain_name != "" && local.site_acm_certificate_arn != "")
    )
    error_message = "site_custom_domain_name and site_acm_certificate_arn must be set when enable_cloudfront is true."
  }
}

resource "aws_codepipeline_custom_action_type" "ec2_build" {
  category      = "Build"
  provider_name = var.build_action_provider_name
  version       = var.build_action_version

  input_artifact_details {
    minimum_count = 1
    maximum_count = 1
  }

  output_artifact_details {
    minimum_count = 1
    maximum_count = 1
  }

  configuration_property {
    name        = "BuildScript"
    description = "Path to the shell script that performs the build step"
    key         = true
    required    = true
    secret      = false
    type        = "String"
  }

  configuration_property {
    name        = "OutputDirectory"
    description = "Directory packaged into the output artifact"
    key         = false
    required    = true
    secret      = false
    type        = "String"
  }

  configuration_property {
    name        = "BuildEnvironmentJson"
    description = "JSON map of build environment variables"
    key         = false
    required    = false
    secret      = false
    type        = "String"
  }

  configuration_property {
    name        = "DeployScript"
    description = "Optional deploy script path used for direct deployments"
    key         = false
    required    = false
    secret      = false
    type        = "String"
  }

  configuration_property {
    name        = "DeployBucketName"
    description = "Optional S3 bucket name used by direct deployments"
    key         = false
    required    = false
    secret      = false
    type        = "String"
  }

  configuration_property {
    name        = "DeployCloudFrontDistributionId"
    description = "Optional CloudFront distribution ID used by direct deployments"
    key         = false
    required    = false
    secret      = false
    type        = "String"
  }

  configuration_property {
    name        = "DeployCloudFrontDomainName"
    description = "Optional CloudFront alias used by direct deployments to resolve the distribution ID at runtime"
    key         = false
    required    = false
    secret      = false
    type        = "String"
  }

  tags = merge(var.tags, {
    ManagedBy = "terraform"
    Service   = "static-site-pipeline"
  })
}

module "build_worker" {
  source = "../../modules/aws_pipeline_ec2_worker"

  name_prefix                 = var.name_prefix
  aws_region                  = var.aws_region
  provider_name               = var.build_action_provider_name
  provider_version            = var.build_action_version
  instance_count              = var.build_worker_instance_count
  instance_type               = var.build_worker_instance_type
  subnet_ids                  = var.build_worker_subnet_ids
  associate_public_ip_address = var.build_worker_associate_public_ip_address
  allowed_ssh_cidrs           = var.build_worker_allowed_ssh_cidrs
  deploy_bucket_names         = local.build_worker_deploy_bucket_names
  artifact_bucket_names       = local.build_worker_artifact_bucket_names
  root_volume_size_gb         = var.build_worker_root_volume_size_gb
  detailed_monitoring         = var.build_worker_detailed_monitoring
  tags                        = var.tags
}

module "site" {
  source = "../../modules/aws_static_site_pipeline"

  name_prefix                       = var.name_prefix
  aws_region                        = var.aws_region
  account_id                        = data.aws_caller_identity.current.account_id
  environment                       = var.environment
  repository                        = var.repository
  branch_name                       = var.branch_name
  connection_arn                    = var.connection_arn
  site_bucket_name                  = var.site_bucket_name
  artifact_bucket_name              = var.artifact_bucket_name
  deploy_cloudfront_distribution_id = ""
  deploy_cloudfront_domain_name     = var.enable_cloudfront ? local.site_custom_domain_name : ""
  enable_cloudfront                 = false
  build_action_provider_name        = var.build_action_provider_name
  build_action_version              = var.build_action_version
  build_action_timeout              = var.build_action_timeout
  build_script_path                 = var.build_script_path
  build_output_directory            = var.build_output_directory
  deploy_script_path                = var.deploy_script_path
  deploy_mode                       = var.deploy_mode
  build_environment                 = local.build_environment
  tags                              = var.tags

  depends_on = [module.build_worker, aws_codepipeline_custom_action_type.ec2_build]
}

data "aws_route53_zone" "tech" {
  name         = "${local.site_route53_zone_name}."
  private_zone = false
}

locals {
  site_alias_name = var.enable_cloudfront ? aws_cloudfront_distribution.site[0].domain_name : replace(module.site.site_website_endpoint, "http://", "")
  site_alias_zone = var.enable_cloudfront ? aws_cloudfront_distribution.site[0].hosted_zone_id : module.site.site_bucket_hosted_zone_id
}

resource "aws_cloudfront_distribution" "site" {
  count = var.enable_cloudfront ? 1 : 0

  enabled             = true
  comment             = "${var.name_prefix} ${var.environment} static site"
  default_root_object = "index.html"
  aliases             = [local.site_custom_domain_name]
  price_class         = "PriceClass_100"
  is_ipv6_enabled     = true
  wait_for_deployment = true

  origin {
    domain_name = replace(module.site.site_website_endpoint, "http://", "")
    origin_id   = "${local.site_custom_domain_name}-origin"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = "${local.site_custom_domain_name}-origin"
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
    acm_certificate_arn            = local.site_acm_certificate_arn
    cloudfront_default_certificate = false
    ssl_support_method             = "sni-only"
    minimum_protocol_version       = "TLSv1.2_2021"
  }

  tags = var.tags
}

resource "aws_route53_record" "site" {
  count = var.enable_cloudfront || length(local.site_route53_a_records) > 0 ? 1 : 0

  allow_overwrite = true
  zone_id         = data.aws_route53_zone.tech.zone_id
  name            = local.site_custom_domain_name
  type            = "A"
  ttl             = var.enable_cloudfront ? null : 300
  records         = var.enable_cloudfront ? null : local.site_route53_a_records

  dynamic "alias" {
    for_each = var.enable_cloudfront ? [1] : []

    content {
      evaluate_target_health = false
      name                   = local.site_alias_name
      zone_id                = local.site_alias_zone
    }
  }
}

resource "aws_route53_record" "site_ipv6" {
  count = var.enable_cloudfront ? 1 : 0

  zone_id = data.aws_route53_zone.tech.zone_id
  name    = local.site_custom_domain_name
  type    = "AAAA"

  alias {
    evaluate_target_health = false
    name                   = local.site_alias_name
    zone_id                = local.site_alias_zone
  }
}

module "site_dev" {
  source = "../../modules/aws_static_site_pipeline"

  name_prefix                       = var.name_prefix
  aws_region                        = var.aws_region
  account_id                        = data.aws_caller_identity.current.account_id
  environment                       = var.dev_environment
  repository                        = var.repository
  branch_name                       = var.dev_branch_name
  connection_arn                    = var.connection_arn
  site_bucket_name                  = var.dev_site_bucket_name
  artifact_bucket_name              = var.dev_artifact_bucket_name
  deploy_cloudfront_distribution_id = ""
  deploy_cloudfront_domain_name     = var.dev_enable_cloudfront ? local.dev_custom_domain_name : ""
  enable_cloudfront                 = false
  build_action_provider_name        = var.build_action_provider_name
  build_action_version              = var.build_action_version
  build_action_timeout              = var.build_action_timeout
  build_script_path                 = var.build_script_path
  build_output_directory            = var.build_output_directory
  deploy_script_path                = var.deploy_script_path
  deploy_mode                       = var.deploy_mode
  build_environment                 = local.dev_build_environment
  tags                              = var.tags

  depends_on = [module.build_worker, aws_codepipeline_custom_action_type.ec2_build]
}

data "aws_route53_zone" "dev" {
  name         = "${local.dev_route53_zone_name}."
  private_zone = false
}

locals {
  dev_site_alias_name = var.dev_enable_cloudfront ? aws_cloudfront_distribution.dev_site[0].domain_name : replace(module.site_dev.site_website_endpoint, "http://", "")
  dev_site_alias_zone = var.dev_enable_cloudfront ? aws_cloudfront_distribution.dev_site[0].hosted_zone_id : module.site_dev.site_bucket_hosted_zone_id
  dev_site_validation = var.dev_enable_cloudfront ? one(aws_acm_certificate.dev_site[0].domain_validation_options) : null
}

resource "aws_acm_certificate" "dev_site" {
  count    = var.dev_enable_cloudfront ? 1 : 0
  provider = aws.use1

  domain_name       = local.dev_custom_domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = var.tags
}

resource "aws_route53_record" "dev_site_cert_validation" {
  count = var.dev_enable_cloudfront ? 1 : 0

  allow_overwrite = true
  zone_id         = data.aws_route53_zone.dev.zone_id
  name            = local.dev_site_validation.resource_record_name
  type            = local.dev_site_validation.resource_record_type
  records         = [local.dev_site_validation.resource_record_value]
  ttl             = 60
}

resource "aws_acm_certificate_validation" "dev_site" {
  count    = var.dev_enable_cloudfront ? 1 : 0
  provider = aws.use1

  certificate_arn         = aws_acm_certificate.dev_site[0].arn
  validation_record_fqdns = [aws_route53_record.dev_site_cert_validation[0].fqdn]
}

resource "aws_cloudfront_distribution" "dev_site" {
  count = var.dev_enable_cloudfront ? 1 : 0

  enabled             = true
  comment             = "${var.name_prefix} ${var.dev_environment} static site"
  default_root_object = "index.html"
  aliases             = [local.dev_custom_domain_name]
  price_class         = "PriceClass_100"
  is_ipv6_enabled     = true
  wait_for_deployment = true

  origin {
    domain_name = replace(module.site_dev.site_website_endpoint, "http://", "")
    origin_id   = "${local.dev_custom_domain_name}-origin"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = "${local.dev_custom_domain_name}-origin"
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
    acm_certificate_arn            = aws_acm_certificate_validation.dev_site[0].certificate_arn
    cloudfront_default_certificate = false
    ssl_support_method             = "sni-only"
    minimum_protocol_version       = "TLSv1.2_2021"
  }

  tags = var.tags
}

resource "aws_route53_record" "dev_site" {
  count = var.dev_enable_cloudfront || length(local.dev_route53_a_records) > 0 ? 1 : 0

  allow_overwrite = true
  zone_id         = data.aws_route53_zone.dev.zone_id
  name            = local.dev_custom_domain_name
  type            = "A"
  ttl             = var.dev_enable_cloudfront ? null : 300
  records         = var.dev_enable_cloudfront ? null : local.dev_route53_a_records

  dynamic "alias" {
    for_each = var.dev_enable_cloudfront ? [1] : []

    content {
      evaluate_target_health = false
      name                   = local.dev_site_alias_name
      zone_id                = local.dev_site_alias_zone
    }
  }
}

resource "aws_route53_record" "dev_site_ipv6" {
  count = var.dev_enable_cloudfront ? 1 : 0

  zone_id = data.aws_route53_zone.dev.zone_id
  name    = local.dev_custom_domain_name
  type    = "AAAA"

  alias {
    evaluate_target_health = false
    name                   = local.dev_site_alias_name
    zone_id                = local.dev_site_alias_zone
  }
}

locals {
  github_oidc_provider_arn = var.enable_github_actions_worker_control ? (
    var.create_github_oidc_provider
    ? aws_iam_openid_connect_provider.github[0].arn
    : data.aws_iam_openid_connect_provider.github[0].arn
  ) : ""
}

# ── GitHub Actions OIDC — lets the workflow monitor the web pipeline and stop the EC2 worker ──
# Enable with: enable_github_actions_worker_control = true in your tfvars.
# After apply, copy the github_actions_role_arn output as GitHub variable AWS_WEB_PIPELINE_ROLE_ARN.

resource "aws_iam_openid_connect_provider" "github" {
  count = (var.enable_github_actions_worker_control && var.create_github_oidc_provider) ? 1 : 0

  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fcd",
  ]
  tags = var.tags
}

data "aws_iam_openid_connect_provider" "github" {
  count = (var.enable_github_actions_worker_control && !var.create_github_oidc_provider) ? 1 : 0
  url   = "https://token.actions.githubusercontent.com"
}

data "aws_iam_policy_document" "github_actions_assume_role" {
  count = var.enable_github_actions_worker_control ? 1 : 0

  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.github_oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.repository}:*"]
    }
  }
}

resource "aws_iam_role" "github_actions" {
  count = var.enable_github_actions_worker_control ? 1 : 0

  name               = var.github_actions_role_name
  assume_role_policy = data.aws_iam_policy_document.github_actions_assume_role[0].json
  tags               = var.tags
}

resource "aws_iam_role_policy" "github_actions_worker_control" {
  count = var.enable_github_actions_worker_control ? 1 : 0

  name = "${var.name_prefix}-web-worker-control"
  role = aws_iam_role.github_actions[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "StartStopWebWorker"
        Effect = "Allow"
        Action = [
          "ec2:StartInstances",
          "ec2:StopInstances",
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "aws:ResourceTag/Project" = "hashpass"
            "aws:ResourceTag/Service" = "pipeline-build-worker"
          }
        }
      },
      {
        Sid    = "DescribeWebWorker"
        Effect = "Allow"
        Action = [
          "ec2:DescribeInstances",
          "ec2:DescribeInstanceStatus",
        ]
        Resource = "*"
      },
      {
        Sid    = "MonitorWebPipelines"
        Effect = "Allow"
        Action = [
          "codepipeline:GetPipelineState",
          "codepipeline:GetPipelineExecution",
          "codepipeline:ListPipelineExecutions",
          "codepipeline:ListActionExecutions",
        ]
        Resource = "*"
      },
    ]
  })
}

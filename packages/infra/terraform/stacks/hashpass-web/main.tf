data "aws_caller_identity" "current" {}

locals {
  build_site_bucket_name     = try(trimspace(var.site_bucket_name), "") != "" ? trimspace(var.site_bucket_name) : "${var.name_prefix}-${var.environment}-site-${data.aws_caller_identity.current.account_id}-${var.aws_region}"
  build_dev_site_bucket_name = try(trimspace(var.dev_site_bucket_name), "") != "" ? trimspace(var.dev_site_bucket_name) : "${var.name_prefix}-${var.dev_environment}-site-${data.aws_caller_identity.current.account_id}-${var.aws_region}"

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
      EXPO_PUBLIC_SUPABASE_URL      = var.supabase_url
      EXPO_PUBLIC_SUPABASE_KEY      = var.supabase_key
      EXPO_PUBLIC_SUPABASE_ANON_KEY = var.supabase_key
    },
    trimspace(var.google_client_id) != "" ? {
      GOOGLE_CLIENT_ID             = trimspace(var.google_client_id)
      BETTER_AUTH_GOOGLE_CLIENT_ID = trimspace(var.google_client_id)
    } : {},
    var.build_environment_overrides
  )

  dev_build_environment = merge(
    {
      EXPO_PUBLIC_SUPABASE_URL      = trimspace(var.supabase_url_dev) != "" ? var.supabase_url_dev : var.supabase_url
      EXPO_PUBLIC_SUPABASE_KEY      = trimspace(var.supabase_key_dev) != "" ? var.supabase_key_dev : var.supabase_key
      EXPO_PUBLIC_SUPABASE_ANON_KEY = trimspace(var.supabase_key_dev) != "" ? var.supabase_key_dev : var.supabase_key
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

  name_prefix                = var.name_prefix
  aws_region                 = var.aws_region
  environment                = var.environment
  repository                 = var.repository
  branch_name                = var.branch_name
  connection_arn             = var.connection_arn
  site_bucket_name           = var.site_bucket_name
  artifact_bucket_name       = var.artifact_bucket_name
  enable_cloudfront          = var.enable_cloudfront
  build_action_provider_name = var.build_action_provider_name
  build_action_version       = var.build_action_version
  build_action_timeout       = var.build_action_timeout
  build_script_path          = var.build_script_path
  build_output_directory     = var.build_output_directory
  deploy_script_path         = var.deploy_script_path
  deploy_mode                = var.deploy_mode
  build_environment          = local.build_environment
  tags                       = var.tags

  depends_on = [module.build_worker, aws_codepipeline_custom_action_type.ec2_build]
}

module "site_dev" {
  source = "../../modules/aws_static_site_pipeline"

  name_prefix                = var.name_prefix
  aws_region                 = var.aws_region
  environment                = var.dev_environment
  repository                 = var.repository
  branch_name                = var.dev_branch_name
  connection_arn             = var.connection_arn
  site_bucket_name           = var.dev_site_bucket_name
  artifact_bucket_name       = var.dev_artifact_bucket_name
  enable_cloudfront          = var.dev_enable_cloudfront
  build_action_provider_name = var.build_action_provider_name
  build_action_version       = var.build_action_version
  build_action_timeout       = var.build_action_timeout
  build_script_path          = var.build_script_path
  build_output_directory     = var.build_output_directory
  deploy_script_path         = var.deploy_script_path
  deploy_mode                = var.deploy_mode
  build_environment          = local.dev_build_environment
  tags                       = var.tags

  depends_on = [module.build_worker, aws_codepipeline_custom_action_type.ec2_build]
}

data "aws_route53_zone" "dev" {
  name         = "${trim(var.dev_route53_zone_name, ".")}."
  private_zone = false
}

resource "aws_route53_record" "dev_site" {
  zone_id = data.aws_route53_zone.dev.zone_id
  name    = trim(var.dev_route53_zone_name, ".")
  type    = "A"

  alias {
    evaluate_target_health = false
    name                   = replace(module.site_dev.site_website_endpoint, "http://", "")
    zone_id                = module.site_dev.site_bucket_hosted_zone_id
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
        Resource = [
          for id in module.build_worker.instance_ids :
          "arn:aws:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:instance/${id}"
        ]
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

locals {
  build_worker_deploy_bucket_names = [
    for bucket_name in [var.site_bucket_name, var.dev_site_bucket_name] : try(trimspace(bucket_name), "")
    if try(trimspace(bucket_name), "") != ""
  ]

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

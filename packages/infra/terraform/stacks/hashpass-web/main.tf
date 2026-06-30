locals {
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

module "site" {
  source = "../../modules/aws_static_site_pipeline"

  name_prefix          = var.name_prefix
  aws_region           = var.aws_region
  environment          = var.environment
  repository           = var.repository
  branch_name          = var.branch_name
  connection_arn       = var.connection_arn
  site_bucket_name     = var.site_bucket_name
  artifact_bucket_name = var.artifact_bucket_name
  enable_cloudfront    = var.enable_cloudfront
  build_environment    = local.build_environment
  tags                 = var.tags
}

module "site_dev" {
  source = "../../modules/aws_static_site_pipeline"

  name_prefix          = var.name_prefix
  aws_region           = var.aws_region
  environment          = var.dev_environment
  repository           = var.repository
  branch_name          = var.dev_branch_name
  connection_arn       = var.connection_arn
  site_bucket_name     = var.dev_site_bucket_name
  artifact_bucket_name = var.dev_artifact_bucket_name
  enable_cloudfront    = var.dev_enable_cloudfront
  build_environment    = local.dev_build_environment
  tags                 = var.tags
}

locals {
  common_tags = merge(var.tags, {
    ManagedBy = "terraform"
    Project   = "hashpass-links-api"
  })
}

# Only evaluated once enable_custom_domain = true -- see the domain_name
# variable's comment for why hashpass.link isn't wired up by default.
data "aws_route53_zone" "link" {
  count        = var.enable_custom_domain ? 1 : 0
  name         = "${trim(var.route53_zone_name, ".")}."
  private_zone = false
}

module "links_api_dev" {
  source = "../../modules/aws_expo_router_api"

  name_prefix              = var.name_prefix
  environment              = "dev"
  domain_name              = var.domain_name.dev
  route53_zone_id          = var.enable_custom_domain ? data.aws_route53_zone.link[0].zone_id : null
  mapping_key              = ""
  lambda_zip_path          = var.lambda_zip_path
  lambda_source_code_hash  = var.lambda_source_code_hash
  lambda_handler           = var.lambda_handler
  lambda_runtime           = var.lambda_runtime
  lambda_memory_size       = var.lambda_memory_size
  lambda_timeout           = var.lambda_timeout
  api_throttle_rate_limit  = var.api_throttle_settings.dev.rate_limit
  api_throttle_burst_limit = var.api_throttle_settings.dev.burst_limit
  enable_custom_domain     = var.enable_custom_domain
  log_retention_days       = var.log_retention_days

  lambda_environment = merge(
    {
      SUPABASE_URL              = lookup(var.supabase_urls, "dev", "")
      SUPABASE_SERVICE_ROLE_KEY = lookup(var.supabase_service_role_keys, "dev", "")
      HASHPASS_LINK_ORIGIN      = lookup(var.link_origins, "dev", "")
      CORS_ALLOW_ORIGINS        = join(",", lookup(var.cors_allow_origins, "dev", []))
    },
    lookup(var.lambda_environment_overrides, "dev", {})
  )

  cors_allow_origins = lookup(var.cors_allow_origins, "dev", ["http://localhost:3000"])

  tags = merge(local.common_tags, {
    Environment = "dev"
  })
}

module "links_api_prod" {
  source = "../../modules/aws_expo_router_api"

  name_prefix              = var.name_prefix
  environment              = "prod"
  domain_name              = var.domain_name.prod
  route53_zone_id          = var.enable_custom_domain ? data.aws_route53_zone.link[0].zone_id : null
  mapping_key              = ""
  lambda_zip_path          = var.lambda_zip_path
  lambda_source_code_hash  = var.lambda_source_code_hash
  lambda_handler           = var.lambda_handler
  lambda_runtime           = var.lambda_runtime
  lambda_memory_size       = var.lambda_memory_size
  lambda_timeout           = var.lambda_timeout
  api_throttle_rate_limit  = var.api_throttle_settings.prod.rate_limit
  api_throttle_burst_limit = var.api_throttle_settings.prod.burst_limit
  enable_custom_domain     = var.enable_custom_domain
  log_retention_days       = var.log_retention_days

  lambda_environment = merge(
    {
      SUPABASE_URL              = lookup(var.supabase_urls, "prod", "")
      SUPABASE_SERVICE_ROLE_KEY = lookup(var.supabase_service_role_keys, "prod", "")
      HASHPASS_LINK_ORIGIN      = lookup(var.link_origins, "prod", "")
      CORS_ALLOW_ORIGINS        = join(",", lookup(var.cors_allow_origins, "prod", []))
    },
    lookup(var.lambda_environment_overrides, "prod", {})
  )

  cors_allow_origins = lookup(var.cors_allow_origins, "prod", ["https://hashpass.club"])

  tags = merge(local.common_tags, {
    Environment = "prod"
  })
}

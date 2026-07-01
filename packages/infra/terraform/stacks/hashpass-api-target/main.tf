locals {
  tech_zone_name = "${trim(var.route53_zone_tech_name, ".")}."

  api_domains = {
    dev  = "api-dev.${trim(var.route53_zone_tech_name, ".")}"
    prod = "api.${trim(var.route53_zone_tech_name, ".")}"
  }

  common_tags = merge(var.tags, {
    ManagedBy = "terraform"
    Project   = "hashpass"
  })
}

data "aws_route53_zone" "tech" {
  name         = local.tech_zone_name
  private_zone = false
}

module "api_dev" {
  source = "../../modules/aws_expo_router_api"

  name_prefix             = var.name_prefix
  environment             = "dev"
  domain_name             = local.api_domains.dev
  route53_zone_id         = data.aws_route53_zone.tech.zone_id
  mapping_key             = var.api_mapping_key
  lambda_zip_path         = var.lambda_zip_path
  lambda_source_code_hash = var.lambda_source_code_hash
  lambda_handler          = var.lambda_handler
  lambda_runtime          = var.lambda_runtime
  lambda_memory_size      = var.lambda_memory_size
  lambda_timeout          = var.lambda_timeout
  enable_custom_domain    = var.enable_custom_domain

  lambda_environment = merge(
    {
      AUTH_PROVIDER            = "directus"
      DIRECTUS_URL             = lookup(var.directus_urls, "dev", "https://sso-dev.hashpass.co")
      EXPO_PUBLIC_DIRECTUS_URL = lookup(var.directus_urls, "dev", "https://sso-dev.hashpass.co")
    },
    lookup(var.lambda_environment_overrides, "dev", {})
  )

  cors_allow_origins = lookup(var.api_cors_origins, "dev", ["http://localhost:8081"])

  tags = merge(local.common_tags, {
    Environment = "dev"
  })
}

module "api_prod" {
  source = "../../modules/aws_expo_router_api"

  name_prefix             = var.name_prefix
  environment             = "prod"
  domain_name             = local.api_domains.prod
  route53_zone_id         = data.aws_route53_zone.tech.zone_id
  mapping_key             = var.api_mapping_key
  lambda_zip_path         = var.lambda_zip_path
  lambda_source_code_hash = var.lambda_source_code_hash
  lambda_handler          = var.lambda_handler
  lambda_runtime          = var.lambda_runtime
  lambda_memory_size      = var.lambda_memory_size
  lambda_timeout          = var.lambda_timeout
  enable_custom_domain    = var.enable_custom_domain

  lambda_environment = merge(
    {
      AUTH_PROVIDER            = "directus"
      DIRECTUS_URL             = lookup(var.directus_urls, "prod", "https://sso.hashpass.co")
      EXPO_PUBLIC_DIRECTUS_URL = lookup(var.directus_urls, "prod", "https://sso.hashpass.co")
    },
    lookup(var.lambda_environment_overrides, "prod", {})
  )

  cors_allow_origins = lookup(var.api_cors_origins, "prod", [
    "https://hashpass.tech",
    "https://www.hashpass.tech",
    "https://bsl.hashpass.tech",
    "https://bsl-dev.hashpass.tech",
    "https://blockchainsummit.hashpass.lat",
    "https://blockchainsummit-dev.hashpass.lat",
  ])

  tags = merge(local.common_tags, {
    Environment = "prod"
  })
}

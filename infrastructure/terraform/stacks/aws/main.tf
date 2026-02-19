locals {
  tech_zone_name = "${trim(var.route53_zone_tech_name, ".")}."
  lat_zone_name  = "${trim(var.route53_zone_lat_name, ".")}."

  api_domains = {
    dev  = "api-dev.${trim(var.route53_zone_tech_name, ".")}"
    prod = "api.${trim(var.route53_zone_tech_name, ".")}"
  }

  common_tags = merge(var.tags, {
    ManagedBy = "terraform"
    Project   = "hashpass"
  })

  amplify_branch_settings = {
    (var.amplify_prod_branch) = {
      stage     = "PRODUCTION"
      framework = "Expo-Web"
    }
    (var.amplify_dev_branch) = {
      stage     = "DEVELOPMENT"
      framework = "Expo-Web"
    }
  }
}

check "amplify_app_id_required" {
  assert {
    condition = (
      (!var.create_amplify_domain_association && !var.manage_amplify_branches) ||
      (var.amplify_app_id != null && trimspace(var.amplify_app_id) != "")
    )
    error_message = "amplify_app_id must be set when create_amplify_domain_association or manage_amplify_branches is true."
  }
}

data "aws_route53_zone" "tech" {
  name         = local.tech_zone_name
  private_zone = false
}

data "aws_route53_zone" "lat" {
  name         = local.lat_zone_name
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

  lambda_environment = merge(
    {
      AUTH_PROVIDER            = "directus"
      DIRECTUS_URL             = lookup(var.directus_urls, "prod", "https://sso.hashpass.co")
      EXPO_PUBLIC_DIRECTUS_URL = lookup(var.directus_urls, "prod", "https://sso.hashpass.co")
    },
    lookup(var.lambda_environment_overrides, "prod", {})
  )

  cors_allow_origins = lookup(var.api_cors_origins, "prod", ["https://blockchainsummit.hashpass.lat"])

  tags = merge(local.common_tags, {
    Environment = "prod"
  })
}

module "frontend_domain_association" {
  count  = var.create_amplify_domain_association ? 1 : 0
  source = "../../modules/aws_amplify_domain"
  providers = {
    aws = aws.amplify
  }

  app_id                = var.amplify_app_id
  domain_name           = trim(var.route53_zone_lat_name, ".")
  wait_for_verification = var.amplify_wait_for_verification

  subdomains = [
    {
      branch_name = var.amplify_prod_branch
      prefix      = "blockchainsummit"
    },
    {
      branch_name = var.amplify_dev_branch
      prefix      = "blockchainsummit-dev"
    }
  ]
}

resource "aws_amplify_branch" "frontend" {
  for_each = var.manage_amplify_branches ? local.amplify_branch_settings : {}
  provider = aws.amplify

  app_id                = var.amplify_app_id
  branch_name           = each.key
  stage                 = each.value.stage
  framework             = each.value.framework
  enable_auto_build     = true
  environment_variables = lookup(var.amplify_branch_environment_variables, each.key, {})
}

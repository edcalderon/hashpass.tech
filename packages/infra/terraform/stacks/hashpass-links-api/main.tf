locals {
  common_tags = merge(var.tags, {
    ManagedBy = "terraform"
    Project   = "hashpass-links-api"
  })

  # aws_expo_router_api's own cors_allow_headers default (Content-Type,
  # Authorization, Cache-Control, Pragma, Expires, X-Client-Version) doesn't
  # include the two custom headers @hashpass/sdk's AuthQrClient sends
  # (x-hashpass-app-id on every request, x-hashpass-binding on poll/exchange
  # -- see packages/sdk/src/auth-qr/client.ts and
  # packages/hashpass-links-api/src/routes/auth-qr.ts). API Gateway's native
  # CORS support answers the browser's preflight OPTIONS itself, before
  # Lambda ever runs, so an incomplete allowlist here rejects the preflight
  # outright -- the request body never even leaves the browser.
  cors_allow_headers = [
    "Content-Type",
    "Authorization",
    "Cache-Control",
    "X-Hashpass-App-Id",
    "X-Hashpass-Binding",
  ]
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
      CORS_ALLOW_ORIGINS        = join(",", lookup(var.cors_allow_origins, "dev", []))
    },
    lookup(var.lambda_environment_overrides, "dev", {})
  )

  cors_allow_origins = lookup(var.cors_allow_origins, "dev", ["http://localhost:3000"])
  cors_allow_headers = local.cors_allow_headers

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
      CORS_ALLOW_ORIGINS        = join(",", lookup(var.cors_allow_origins, "prod", []))
    },
    lookup(var.lambda_environment_overrides, "prod", {})
  )

  cors_allow_origins = lookup(var.cors_allow_origins, "prod", ["https://hashpass.club"])
  cors_allow_headers = local.cors_allow_headers

  tags = merge(local.common_tags, {
    Environment = "prod"
  })
}

resource "aws_cloudwatch_event_rule" "qr_link_expiry_dev" {
  name                = "${var.name_prefix}-dev-qr-link-expiry"
  description         = "Archives ended HashPass QR links"
  schedule_expression = var.qr_link_expiry_sweep_schedule
  tags = merge(local.common_tags, {
    Environment = "dev"
  })
}

resource "aws_cloudwatch_event_target" "qr_link_expiry_dev" {
  rule = aws_cloudwatch_event_rule.qr_link_expiry_dev.name
  arn  = module.links_api_dev.lambda_function_arn
}

resource "aws_lambda_permission" "allow_qr_link_expiry_dev" {
  statement_id  = "AllowEventBridgeQrLinkExpiry"
  action        = "lambda:InvokeFunction"
  function_name = module.links_api_dev.lambda_function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.qr_link_expiry_dev.arn
}

resource "aws_cloudwatch_event_rule" "qr_link_expiry_prod" {
  name                = "${var.name_prefix}-prod-qr-link-expiry"
  description         = "Archives ended HashPass QR links"
  schedule_expression = var.qr_link_expiry_sweep_schedule
  tags = merge(local.common_tags, {
    Environment = "prod"
  })
}

resource "aws_cloudwatch_event_target" "qr_link_expiry_prod" {
  rule = aws_cloudwatch_event_rule.qr_link_expiry_prod.name
  arn  = module.links_api_prod.lambda_function_arn
}

resource "aws_lambda_permission" "allow_qr_link_expiry_prod" {
  statement_id  = "AllowEventBridgeQrLinkExpiry"
  action        = "lambda:InvokeFunction"
  function_name = module.links_api_prod.lambda_function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.qr_link_expiry_prod.arn
}

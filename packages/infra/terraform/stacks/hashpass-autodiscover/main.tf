# ============================================================================
# hashpass-autodiscover: self-hosted Autodiscover responder for hashpass.tech
# ============================================================================
# Added 2026-08-16 -- see .agents/pending/task-hostinger-autodiscover-cert-mismatch.md
# for the full diagnosis. Hostinger's shared autodiscover.mail.hostinger.com
# endpoint (the CNAME target autodiscover.hashpass.tech previously pointed
# at) presents a TLS certificate covering only *.mail.hostinger.com, which
# any client doing standard TLS hostname validation rejects. This stack
# deploys a tiny, dedicated Lambda (packages/infra/lambda/autodiscover --
# not the full Expo Router bundle, the response is identical for every
# request) behind its own ACM-issued cert for autodiscover.hashpass.tech
# specifically, so there is no SNI/SAN mismatch.
#
# Deliberately its own isolated stack/state, not a module block added to
# stacks/hashpass-api-target -- that stack's Terraform-tracked Lambda
# environment has drifted far behind the real live environment (managed
# out-of-band via deploy-api-lambda.sh), so applying anything there risks
# wiping production secrets. Confirmed via a real `terraform plan` on
# 2026-08-16 that showed exactly that. This stack owns nothing that stack
# owns -- a completely separate Lambda, API Gateway, and Route53 record.
# ============================================================================

data "aws_route53_zone" "tech" {
  name         = "${trim(var.route53_zone_name, ".")}."
  private_zone = false
}

module "autodiscover" {
  source = "../../modules/aws_expo_router_api"

  name_prefix              = var.name_prefix
  environment              = "prod"
  domain_name              = "autodiscover.${trim(var.route53_zone_name, ".")}"
  route53_zone_id          = data.aws_route53_zone.tech.zone_id
  mapping_key              = ""
  lambda_zip_path          = var.lambda_zip_path
  lambda_source_code_hash  = var.lambda_source_code_hash
  lambda_handler           = "index.handler"
  lambda_runtime           = "nodejs22.x"
  lambda_memory_size       = 128
  lambda_timeout           = 5
  api_throttle_rate_limit  = 20
  api_throttle_burst_limit = 40
  enable_custom_domain     = var.enable_custom_domain

  # Called directly by mail clients over HTTPS, never from a browser -- no
  # CORS needed. The module's own defaults (allow-origin "*" + allow-
  # credentials true) are mutually exclusive per API Gateway, so this must
  # be set explicitly rather than left at default.
  cors_allow_credentials = false

  tags = var.tags
}

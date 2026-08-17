# Attaches ONE additional custom domain onto an *existing* API Gateway v2
# API, so several public domains (hpass.id, hashpass.link, hashp.link, ...)
# can all front the same Lambda/API without duplicating it -- unlike
# ../aws_expo_router_api, which creates its own API and supports exactly one
# domain per instance. This module is intentionally never conditional
# internally; the caller wraps the whole `module` block in `count` to enable
# or disable a given domain, keeping aws_expo_router_api (shared by other
# stacks) completely untouched.

locals {
  mapping_key = trimspace(var.mapping_key) == "" ? null : trimspace(var.mapping_key)
}

resource "aws_acm_certificate" "domain" {
  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = var.tags
}

resource "aws_route53_record" "cert_validation" {
  allow_overwrite = true
  zone_id         = var.route53_zone_id
  name            = one(aws_acm_certificate.domain.domain_validation_options).resource_record_name
  type            = one(aws_acm_certificate.domain.domain_validation_options).resource_record_type
  records         = [one(aws_acm_certificate.domain.domain_validation_options).resource_record_value]
  ttl             = 60
}

resource "aws_acm_certificate_validation" "domain" {
  certificate_arn         = aws_acm_certificate.domain.arn
  validation_record_fqdns = [aws_route53_record.cert_validation.fqdn]
}

resource "aws_apigatewayv2_domain_name" "domain" {
  domain_name = var.domain_name

  domain_name_configuration {
    certificate_arn = aws_acm_certificate_validation.domain.certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }

  tags = var.tags
}

resource "aws_apigatewayv2_api_mapping" "domain" {
  api_id          = var.api_id
  domain_name     = aws_apigatewayv2_domain_name.domain.id
  stage           = var.stage_name
  api_mapping_key = local.mapping_key
}

resource "aws_route53_record" "ipv4" {
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    evaluate_target_health = false
    name                   = aws_apigatewayv2_domain_name.domain.domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.domain.domain_name_configuration[0].hosted_zone_id
  }
}

resource "aws_route53_record" "ipv6" {
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "AAAA"

  alias {
    evaluate_target_health = false
    name                   = aws_apigatewayv2_domain_name.domain.domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.domain.domain_name_configuration[0].hosted_zone_id
  }
}

# ============================================================================
# demo-events: additive, isolated infra for demo-mode event subdomains
# ============================================================================
# Stands up a dedicated ACM cert + CloudFront distribution + Route53 alias
# per demo-mode tenant (see var.demo_events), each pointed at its own
# dedicated S3 site bucket populated by pipeline.tf's CodePipeline (source:
# `develop` branch -- demo-mode events are pinned to develop/dev credentials
# only, see apps/mobile-app/config/supabase-profiles.ts's isDemo guard, so
# "develop" and "demo" are the same tag for now per that guard's design).
#
# Deliberately does NOT touch bsl.hashpass.tech's own CloudFront
# distribution, cert, alias list, or S3 bucket -- that distribution lives in
# a different (source) AWS account and serves live BSL production traffic.
# An earlier iteration of this stack reused BSL *dev*'s bucket as a
# read-only origin, but that bucket's deployed bundle has
# EXPO_PUBLIC_BSL_SUPABASE_URL_DEV baked in wrong (points at core-development,
# a pre-existing bsl-target pipeline mismatch -- see variables.tf) which
# would have silently defeated the isDemo->develop-DB guard. A dedicated
# bucket + pipeline avoids inheriting that bug.

data "aws_caller_identity" "current" {}

data "aws_route53_zone" "this" {
  provider = aws.source_dns

  name         = "${var.route53_zone_name}."
  private_zone = false
}

locals {
  # Hand-maintained per demo event -- see pipeline.tf for the pipeline that
  # populates each bucket. Add a line here (and a matching module block in
  # pipeline.tf) for the next demo-mode event.
  criptolatinfest_site_bucket_name   = "hashpass-criptolatinfest-develop-site-${data.aws_caller_identity.current.account_id}-${var.aws_region}"
  criptolatinfest_site_origin_domain = "${local.criptolatinfest_site_bucket_name}.s3-website.${var.aws_region}.amazonaws.com"
  # Shorter prefix than the site bucket -- "-pipelines" pushes the full
  # name past S3's 63-char bucket name limit otherwise (confirmed via a
  # real failed plan).
  criptolatinfest_artifact_bucket_name = "hashpass-clf-demo-pipelines-${data.aws_caller_identity.current.account_id}-${var.aws_region}"

  demo_event_origin_domain_names = {
    criptolatinfest = local.criptolatinfest_site_origin_domain
  }
}

# CachingOptimized clone that additionally whitelists the `_hpv` query
# string param, matching BSL prod's `hashpass-bsl-hpv-cache-key` policy
# (source account, not shareable cross-account) -- this is what lets the
# app's forced-cache-bust reload (performHardReload()) actually bust
# CloudFront's cache instead of being silently ignored.
resource "aws_cloudfront_cache_policy" "demo_hpv_cache_key" {
  name    = "hashpass-demo-events-hpv-cache-key"
  comment = "CachingOptimized clone; whitelists _hpv for CDN cache-busting reloads"

  default_ttl = 86400
  max_ttl     = 31536000
  min_ttl     = 1

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_gzip   = true
    enable_accept_encoding_brotli = true

    headers_config {
      header_behavior = "none"
    }

    cookies_config {
      cookie_behavior = "none"
    }

    query_strings_config {
      query_string_behavior = "whitelist"
      query_strings {
        items = ["_hpv"]
      }
    }
  }
}

resource "aws_acm_certificate" "demo" {
  for_each = var.demo_events
  provider = aws.use1

  domain_name       = each.value.subdomain
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = merge(var.tags, { Event = each.key })
}

resource "aws_route53_record" "demo_cert_validation" {
  for_each = var.demo_events
  provider = aws.source_dns

  allow_overwrite = true
  zone_id         = data.aws_route53_zone.this.zone_id
  name            = one(aws_acm_certificate.demo[each.key].domain_validation_options).resource_record_name
  type            = one(aws_acm_certificate.demo[each.key].domain_validation_options).resource_record_type
  records         = [one(aws_acm_certificate.demo[each.key].domain_validation_options).resource_record_value]
  ttl             = 60
}

resource "aws_acm_certificate_validation" "demo" {
  for_each = var.demo_events
  provider = aws.use1

  certificate_arn         = aws_acm_certificate.demo[each.key].arn
  validation_record_fqdns = [aws_route53_record.demo_cert_validation[each.key].fqdn]
}

resource "aws_cloudfront_distribution" "demo" {
  for_each = var.demo_events

  enabled             = true
  comment             = "HASHPASS demo-mode event site: ${each.key}"
  default_root_object = "index.html"
  aliases             = [each.value.subdomain]
  price_class         = "PriceClass_All"
  is_ipv6_enabled     = true
  wait_for_deployment = true

  origin {
    domain_name = local.demo_event_origin_domain_names[each.key]
    origin_id   = "${each.key}-origin"

    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "http-only"
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = 30
      origin_keepalive_timeout = 5
    }
  }

  default_cache_behavior {
    target_origin_id       = "${each.key}-origin"
    allowed_methods        = ["HEAD", "DELETE", "POST", "GET", "OPTIONS", "PUT", "PATCH"]
    cached_methods         = ["HEAD", "GET"]
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    cache_policy_id        = aws_cloudfront_cache_policy.demo_hpv_cache_key.id
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
    acm_certificate_arn            = aws_acm_certificate_validation.demo[each.key].certificate_arn
    cloudfront_default_certificate = false
    ssl_support_method             = "sni-only"
    minimum_protocol_version       = "TLSv1.2_2021"
  }

  tags = merge(var.tags, { Event = each.key })
}

resource "aws_route53_record" "demo" {
  for_each = var.demo_events
  provider = aws.source_dns

  allow_overwrite = true
  zone_id         = data.aws_route53_zone.this.zone_id
  name            = each.value.subdomain
  type            = "A"

  alias {
    evaluate_target_health = true
    name                   = aws_cloudfront_distribution.demo[each.key].domain_name
    zone_id                = aws_cloudfront_distribution.demo[each.key].hosted_zone_id
  }
}

resource "aws_route53_record" "demo_ipv6" {
  for_each = var.demo_events
  provider = aws.source_dns

  allow_overwrite = true
  zone_id         = data.aws_route53_zone.this.zone_id
  name            = each.value.subdomain
  type            = "AAAA"

  alias {
    evaluate_target_health = true
    name                   = aws_cloudfront_distribution.demo[each.key].domain_name
    zone_id                = aws_cloudfront_distribution.demo[each.key].hosted_zone_id
  }
}

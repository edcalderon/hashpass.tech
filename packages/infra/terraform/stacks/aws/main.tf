locals {
  tech_zone_name          = "${trim(var.route53_zone_tech_name, ".")}."
  lat_zone_name           = "${trim(var.route53_zone_lat_name, ".")}."
  club_zone_name          = "${trim(var.route53_zone_club_name, ".")}."
  site_custom_domain_name = trimspace(var.site_custom_domain_name)
  site_www_domain_name    = trimspace(var.site_www_domain_name)
  site_origin_domain_name = trimspace(var.site_origin_domain_name)
  site_cloudfront_aliases = distinct([
    for domain_name in [local.site_custom_domain_name, local.site_www_domain_name] :
    domain_name if domain_name != ""
  ])

  github_pages_domain = trim(var.github_pages_domain, ".")
  github_pages_a_records = [
    "185.199.108.153",
    "185.199.109.153",
    "185.199.110.153",
    "185.199.111.153",
  ]
  github_pages_aaaa_records = [
    "2606:50c0:8000::153",
    "2606:50c0:8001::153",
    "2606:50c0:8002::153",
    "2606:50c0:8003::153",
  ]
  github_pages_aliases = [
    "club.hashpass.tech",
    "docs.hashpass.tech",
  ]

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
      try(trimspace(var.amplify_app_id), "") != ""
    )
    error_message = "amplify_app_id must be set when create_amplify_domain_association or manage_amplify_branches is true."
  }
}

check "site_cloudfront_inputs" {
  assert {
    condition     = local.site_custom_domain_name != "" && local.site_www_domain_name != "" && local.site_origin_domain_name != ""
    error_message = "site_custom_domain_name, site_www_domain_name, and site_origin_domain_name must be set for the hashpass.tech front door."
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

data "aws_route53_zone" "club" {
  name         = local.club_zone_name
  private_zone = false
}

data "aws_route53_zone" "site" {
  name         = local.tech_zone_name
  private_zone = false
}

locals {
  site_validation_records = {
    for validation in aws_acm_certificate.site.domain_validation_options :
    validation.domain_name => validation
  }
}

resource "aws_acm_certificate" "site" {
  domain_name               = local.site_custom_domain_name
  subject_alternative_names = [local.site_www_domain_name]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = merge(local.common_tags, {
    Domain = local.site_custom_domain_name
  })
}

resource "aws_route53_record" "site_cert_validation" {
  for_each = local.site_validation_records

  allow_overwrite = true
  zone_id         = data.aws_route53_zone.site.zone_id
  name            = each.value.resource_record_name
  type            = each.value.resource_record_type
  records         = [each.value.resource_record_value]
  ttl             = 60
}

resource "aws_acm_certificate_validation" "site" {
  certificate_arn = aws_acm_certificate.site.arn
  validation_record_fqdns = [
    for record in aws_route53_record.site_cert_validation : record.fqdn
  ]
}

resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  comment             = "${var.name_prefix} ${local.site_custom_domain_name} front door"
  default_root_object = "index.html"
  aliases             = local.site_cloudfront_aliases
  price_class         = "PriceClass_100"
  is_ipv6_enabled     = true
  wait_for_deployment = true

  origin {
    domain_name = local.site_origin_domain_name
    origin_id   = "${local.site_custom_domain_name}-origin"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "http-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  default_cache_behavior {
    target_origin_id       = "${local.site_custom_domain_name}-origin"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD", "OPTIONS"]
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    forwarded_values {
      query_string = false

      cookies {
        forward = "none"
      }
    }
  }

  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
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
    acm_certificate_arn            = aws_acm_certificate_validation.site.certificate_arn
    cloudfront_default_certificate = false
    ssl_support_method             = "sni-only"
    minimum_protocol_version       = "TLSv1.2_2021"
  }

  tags = merge(local.common_tags, {
    Domain = local.site_custom_domain_name
  })
}

resource "aws_route53_record" "site" {
  zone_id = data.aws_route53_zone.site.zone_id
  name    = local.site_custom_domain_name
  type    = "A"
  ttl     = null

  allow_overwrite = true

  alias {
    evaluate_target_health = false
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
  }
}

resource "aws_route53_record" "site_ipv6" {
  zone_id = data.aws_route53_zone.site.zone_id
  name    = local.site_custom_domain_name
  type    = "AAAA"

  allow_overwrite = true

  alias {
    evaluate_target_health = false
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
  }
}

resource "aws_route53_record" "site_www" {
  zone_id = data.aws_route53_zone.site.zone_id
  name    = local.site_www_domain_name
  type    = "CNAME"
  ttl     = 300
  records = [local.site_custom_domain_name]

  allow_overwrite = true
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

resource "aws_route53_record" "github_pages_apex_a" {
  zone_id         = data.aws_route53_zone.club.zone_id
  name            = local.github_pages_domain
  type            = "A"
  ttl             = 300
  records         = local.github_pages_a_records
  allow_overwrite = true
}

resource "aws_route53_record" "github_pages_apex_aaaa" {
  zone_id         = data.aws_route53_zone.club.zone_id
  name            = local.github_pages_domain
  type            = "AAAA"
  ttl             = 300
  records         = local.github_pages_aaaa_records
  allow_overwrite = true
}

resource "aws_route53_record" "github_pages_aliases" {
  for_each = toset(local.github_pages_aliases)

  zone_id         = data.aws_route53_zone.tech.zone_id
  name            = each.value
  type            = "CNAME"
  ttl             = 300
  records         = [local.github_pages_domain]
  allow_overwrite = true
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

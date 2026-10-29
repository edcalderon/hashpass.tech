data "aws_caller_identity" "current" {}

data "aws_route53_zone" "tech" {
  name         = "${trim(var.route53_zone_name, ".")}."
  private_zone = false
}

data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

locals {
  site_bucket_names = {
    for event_id in keys(var.event_sites) : event_id => "hashpass-event-${event_id}-prod-${data.aws_caller_identity.current.account_id}-${var.aws_region}"
  }
  site_origin_ids = {
    for event_id in keys(var.event_sites) : event_id => "${local.site_bucket_names[event_id]}-origin"
  }
  common_tags = merge(var.tags, {
    ManagedBy = "terraform"
    Project   = "hashpass"
    Stack     = "event-production-sites"
  })
}

resource "aws_cloudfront_cache_policy" "site" {
  name    = "hashpass-event-production-hpv-cache-key"
  comment = "Static event site cache policy; whitelist _hpv for application cache-busting reloads."

  default_ttl = 86400
  max_ttl     = 31536000
  min_ttl     = 0

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

resource "aws_s3_bucket" "site" {
  for_each = var.event_sites

  bucket        = local.site_bucket_names[each.key]
  force_destroy = false
  tags          = merge(local.common_tags, { Event = each.key })
}

resource "aws_s3_bucket_public_access_block" "site" {
  for_each = var.event_sites

  bucket                  = aws_s3_bucket.site[each.key].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "site" {
  for_each = var.event_sites

  bucket = aws_s3_bucket.site[each.key].id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "site" {
  for_each = var.event_sites

  bucket = aws_s3_bucket.site[each.key].id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "site" {
  for_each = var.event_sites

  bucket = aws_s3_bucket.site[each.key].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_cloudfront_origin_access_control" "site" {
  for_each = var.event_sites

  name                              = "${local.site_bucket_names[each.key]}-oac"
  description                       = "Private S3 access for ${each.value.hostname}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_acm_certificate" "site" {
  for_each = var.event_sites
  provider = aws.use1

  domain_name       = each.value.hostname
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = merge(local.common_tags, { Event = each.key })
}

resource "aws_route53_record" "certificate_validation" {
  for_each = var.event_sites

  allow_overwrite = true
  zone_id         = data.aws_route53_zone.tech.zone_id
  name            = one(aws_acm_certificate.site[each.key].domain_validation_options).resource_record_name
  type            = one(aws_acm_certificate.site[each.key].domain_validation_options).resource_record_type
  records         = [one(aws_acm_certificate.site[each.key].domain_validation_options).resource_record_value]
  ttl             = 60
}

resource "aws_acm_certificate_validation" "site" {
  for_each = var.event_sites
  provider = aws.use1

  certificate_arn         = aws_acm_certificate.site[each.key].arn
  validation_record_fqdns = [aws_route53_record.certificate_validation[each.key].fqdn]
}

resource "aws_cloudfront_distribution" "site" {
  for_each = var.event_sites

  enabled             = true
  comment             = "HASHPASS production event site: ${each.key}"
  default_root_object = "index.html"
  aliases             = [each.value.hostname]
  price_class         = "PriceClass_All"
  is_ipv6_enabled     = true
  wait_for_deployment = true

  origin {
    domain_name              = aws_s3_bucket.site[each.key].bucket_regional_domain_name
    origin_id                = local.site_origin_ids[each.key]
    origin_access_control_id = aws_cloudfront_origin_access_control.site[each.key].id
  }

  default_cache_behavior {
    target_origin_id           = local.site_origin_ids[each.key]
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD", "OPTIONS"]
    viewer_protocol_policy     = "redirect-to-https"
    compress                   = true
    cache_policy_id            = aws_cloudfront_cache_policy.site.id
    response_headers_policy_id = "67f7725c-6f97-4210-82d7-5512b31e9d03" # AWS managed SecurityHeadersPolicy
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
    acm_certificate_arn            = aws_acm_certificate_validation.site[each.key].certificate_arn
    cloudfront_default_certificate = false
    ssl_support_method             = "sni-only"
    minimum_protocol_version       = "TLSv1.2_2021"
  }

  tags = merge(local.common_tags, { Event = each.key })
}

resource "aws_s3_bucket_policy" "site" {
  for_each = var.event_sites

  bucket = aws_s3_bucket.site[each.key].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontRead"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = ["s3:GetObject"]
      Resource  = "${aws_s3_bucket.site[each.key].arn}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.site[each.key].arn
        }
      }
    }]
  })
}

resource "aws_route53_record" "site_ipv4" {
  for_each = var.event_sites

  zone_id = data.aws_route53_zone.tech.zone_id
  name    = each.value.hostname
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.site[each.key].domain_name
    zone_id                = aws_cloudfront_distribution.site[each.key].hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "site_ipv6" {
  for_each = var.event_sites

  zone_id = data.aws_route53_zone.tech.zone_id
  name    = each.value.hostname
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.site[each.key].domain_name
    zone_id                = aws_cloudfront_distribution.site[each.key].hosted_zone_id
    evaluate_target_health = false
  }
}

data "aws_iam_policy_document" "site_deploy_trust" {
  for_each = var.event_sites

  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repository}:environment:${each.value.github_environment}"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:ref"
      values   = ["refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "site_deploy" {
  for_each = var.event_sites

  name                 = "hashpass-event-${each.key}-site-deploy"
  assume_role_policy   = data.aws_iam_policy_document.site_deploy_trust[each.key].json
  max_session_duration = 3600
  tags                 = merge(local.common_tags, { Event = each.key })
}

data "aws_iam_policy_document" "site_deploy_permissions" {
  for_each = var.event_sites

  statement {
    sid = "ListOwnSiteBucket"
    actions = [
      "s3:GetBucketLocation",
      "s3:ListBucket",
      "s3:ListBucketMultipartUploads",
    ]
    resources = [aws_s3_bucket.site[each.key].arn]
  }

  statement {
    sid = "PublishOwnSiteObjects"
    actions = [
      "s3:AbortMultipartUpload",
      "s3:DeleteObject",
      "s3:GetObject",
      "s3:ListMultipartUploadParts",
      "s3:PutObject",
    ]
    resources = ["${aws_s3_bucket.site[each.key].arn}/*"]
  }

  statement {
    sid       = "InvalidateOwnDistribution"
    actions   = ["cloudfront:CreateInvalidation"]
    resources = [aws_cloudfront_distribution.site[each.key].arn]
  }
}

resource "aws_iam_role_policy" "site_deploy" {
  for_each = var.event_sites

  name   = "publish-event-static-site"
  role   = aws_iam_role.site_deploy[each.key].id
  policy = data.aws_iam_policy_document.site_deploy_permissions[each.key].json
}

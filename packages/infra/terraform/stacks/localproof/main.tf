# ============================================================================
# localproof: standalone hosting for the LocalPass offline-tourism MVP at
# localproof.org (apps/localpass in the monorepo; mirrored for independent
# packaging at https://github.com/hashpass-tech/localproof.org -- see
# .github/workflows/localpass-mirror.yml).
# ============================================================================
# Deliberately does NOT create the Route53 hosted zone (it already exists,
# created out-of-band before this stack -- see the `data` lookup below) and
# deliberately does NOT reuse modules/aws_static_site_pipeline's
# CodePipeline/CodeBuild path: per CLAUDE.md, that machinery is retained for
# manual recovery only on existing tenants, and this repo's current
# direction is GitHub-hosted builds deploying straight to S3 (see
# github-hosted-tenant-site-deploy.yml) -- a brand-new hackathon MVP
# shouldn't add a new instance of the legacy, costlier CodeBuild/CodePipeline
# path. This stack is the smallest version of the modern pattern: a private,
# OAC-protected S3 bucket + CloudFront, no pipeline resources at all. The
# initial deploy and any follow-up deploys are a plain `aws s3 sync` +
# CloudFront invalidation against the bucket/distribution this stack
# outputs.
#
# localproof.org is still on its registrar's (Spaceship) default
# nameservers as of this stack's creation -- see the name_servers output for
# the 4 values that must be set at the registrar for any of this to resolve
# publicly. Same situation, same reasoning, as hpass.id/hashp.link in
# hashpass-dns/main.tf. See variables.tf's enable_custom_domain for how this
# stack sequences around that external, unavoidable wait.

data "aws_caller_identity" "current" {}

data "aws_route53_zone" "this" {
  name         = "${var.domain_name}."
  private_zone = false
}

locals {
  aliases     = [var.domain_name, "www.${var.domain_name}"]
  bucket_name = "hashpass-localproof-site-${data.aws_caller_identity.current.account_id}-${var.aws_region}"
}

resource "aws_s3_bucket" "site" {
  bucket        = local.bucket_name
  force_destroy = false
  tags          = var.tags
}

resource "aws_s3_bucket_ownership_controls" "site" {
  bucket = aws_s3_bucket.site.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "site" {
  bucket                  = aws_s3_bucket.site.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "site" {
  bucket = aws_s3_bucket.site.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "site" {
  bucket = aws_s3_bucket.site.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Requested unconditionally (cheap, non-blocking) so its DNS validation
# records can sit in the zone ready to go -- ACM validates this in the
# background the moment the registrar cutover propagates, with no further
# Terraform action required. See enable_custom_domain.
resource "aws_acm_certificate" "site" {
  provider = aws.use1

  domain_name               = var.domain_name
  subject_alternative_names = ["www.${var.domain_name}"]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = var.tags
}

resource "aws_route53_record" "cert_validation" {
  for_each = {
    for option in aws_acm_certificate.site.domain_validation_options : option.domain_name => {
      name  = option.resource_record_name
      type  = option.resource_record_type
      value = option.resource_record_value
    }
  }

  allow_overwrite = true
  zone_id         = data.aws_route53_zone.this.zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.value]
  ttl             = 60
}

# Blocks apply until ACM reports ISSUED -- only create this once the
# registrar cutover has actually propagated (enable_custom_domain = true),
# otherwise `terraform apply` hangs waiting on a validation that can never
# complete while the domain still resolves via the registrar's nameservers.
resource "aws_acm_certificate_validation" "site" {
  count    = var.enable_custom_domain ? 1 : 0
  provider = aws.use1

  certificate_arn         = aws_acm_certificate.site.arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}

resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "${local.bucket_name}-oac"
  description                       = "Origin access control for ${local.bucket_name}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  comment             = "LocalPass MVP: ${var.domain_name}"
  default_root_object = "index.html"
  aliases             = var.enable_custom_domain ? local.aliases : []
  price_class         = "PriceClass_100"
  is_ipv6_enabled     = true
  wait_for_deployment = true

  origin {
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_id                = "localproof-site"
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  default_cache_behavior {
    target_origin_id       = "localproof-site"
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
    acm_certificate_arn            = var.enable_custom_domain ? aws_acm_certificate_validation.site[0].certificate_arn : null
    cloudfront_default_certificate = !var.enable_custom_domain
    ssl_support_method             = var.enable_custom_domain ? "sni-only" : null
    minimum_protocol_version       = var.enable_custom_domain ? "TLSv1.2_2021" : null
  }

  tags = var.tags
}

data "aws_iam_policy_document" "site_bucket_cloudfront" {
  statement {
    sid       = "AllowCloudFrontRead"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.site.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.site.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "site" {
  bucket = aws_s3_bucket.site.id
  policy = data.aws_iam_policy_document.site_bucket_cloudfront.json
}

resource "aws_route53_record" "apex_a" {
  count           = var.enable_custom_domain ? 1 : 0
  allow_overwrite = true
  zone_id         = data.aws_route53_zone.this.zone_id
  name            = var.domain_name
  type            = "A"

  alias {
    evaluate_target_health = true
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
  }
}

resource "aws_route53_record" "apex_aaaa" {
  count           = var.enable_custom_domain ? 1 : 0
  allow_overwrite = true
  zone_id         = data.aws_route53_zone.this.zone_id
  name            = var.domain_name
  type            = "AAAA"

  alias {
    evaluate_target_health = true
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
  }
}

resource "aws_route53_record" "www_a" {
  count           = var.enable_custom_domain ? 1 : 0
  allow_overwrite = true
  zone_id         = data.aws_route53_zone.this.zone_id
  name            = "www.${var.domain_name}"
  type            = "A"

  alias {
    evaluate_target_health = true
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
  }
}

resource "aws_route53_record" "www_aaaa" {
  count           = var.enable_custom_domain ? 1 : 0
  allow_overwrite = true
  zone_id         = data.aws_route53_zone.this.zone_id
  name            = "www.${var.domain_name}"
  type            = "AAAA"

  alias {
    evaluate_target_health = true
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
  }
}

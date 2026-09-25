# Bare "redirect this whole domain to another one, over real HTTPS"
# distribution. There's no native Route53/S3-only way to do this: an apex
# hostname can't be a CNAME, and an S3 website endpoint (the usual redirect
# trick) never terminates HTTPS for a custom domain. So this is the standard
# shape -- ACM cert + CloudFront + a CloudFront Function that returns the
# redirect directly on viewer-request, before CloudFront would ever contact
# an origin. The S3 bucket below exists only because CloudFront requires a
# syntactically valid origin; the function short-circuits every request, so
# no object in that bucket is ever actually read.

locals {
  bucket_name        = "${var.name_prefix}-unused-origin"
  primary_domain     = var.domain_names[0]
  extra_domains      = slice(var.domain_names, 1, length(var.domain_names))
  target_path_prefix = trimsuffix(var.target_path_prefix, "/")
  tags = merge(var.tags, {
    ManagedBy = "terraform"
    Service   = "domain-redirect"
  })
}

resource "aws_s3_bucket" "unused_origin" {
  bucket        = local.bucket_name
  force_destroy = true
  tags          = local.tags
}

resource "aws_s3_bucket_public_access_block" "unused_origin" {
  bucket                  = aws_s3_bucket.unused_origin.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_cloudfront_origin_access_control" "unused_origin" {
  name                              = "${local.bucket_name}-oac"
  description                       = "Origin access control for the unused redirect-distribution origin (${var.name_prefix})"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# DNS-validated, must be requested in us-east-1 regardless of the caller's
# default provider region -- that's a hard CloudFront requirement, not a
# convention.
resource "aws_acm_certificate" "redirect" {
  provider = aws.use1

  domain_name               = local.primary_domain
  subject_alternative_names = local.extra_domains
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = local.tags
}

resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.redirect.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  zone_id         = var.route53_zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 60
}

resource "aws_acm_certificate_validation" "redirect" {
  provider = aws.use1

  certificate_arn         = aws_acm_certificate.redirect.arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}

# Redirects with the original path and query string preserved, e.g.
# https://hashpass.app/foo?x=1 -> https://hashpass.tech/foo?x=1. Query
# values are re-percent-encoded (CloudFront Functions hands us a parsed
# querystring object, not the raw string) -- functionally equivalent, not a
# byte-for-byte copy of the original encoding.
resource "aws_cloudfront_function" "redirect" {
  name    = "${var.name_prefix}-redirect"
  runtime = "cloudfront-js-1.0"
  comment = "301 redirect to ${var.target_origin}"
  publish = true

  code = <<-EOT
    function handler(event) {
      var request = event.request;
      var qsObject = request.querystring;
      var parts = [];
      for (var key in qsObject) {
        var entry = qsObject[key];
        if (entry.multiValue) {
          for (var i = 0; i < entry.multiValue.length; i++) {
            parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(entry.multiValue[i].value));
          }
        } else {
          parts.push(encodeURIComponent(key) + (entry.value ? '=' + encodeURIComponent(entry.value) : ''));
        }
      }
      var query = parts.length ? '?' + parts.join('&') : '';

      return {
        statusCode: 301,
        statusDescription: 'Moved Permanently',
        headers: {
          location: { value: '${var.target_origin}' + '${local.target_path_prefix}' + request.uri + query }
        }
      };
    }
  EOT
}

resource "aws_cloudfront_distribution" "redirect" {
  enabled             = true
  comment             = "${var.name_prefix}: ${join(", ", var.domain_names)} -> ${var.target_origin}"
  aliases             = var.domain_names
  price_class         = var.price_class
  is_ipv6_enabled     = true
  wait_for_deployment = true

  origin {
    domain_name              = aws_s3_bucket.unused_origin.bucket_regional_domain_name
    origin_id                = local.bucket_name
    origin_access_control_id = aws_cloudfront_origin_access_control.unused_origin.id
  }

  default_cache_behavior {
    target_origin_id       = local.bucket_name
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    viewer_protocol_policy = "redirect-to-https"
    compress               = false

    # Managed-CachingDisabled -- every request must reach the function so it
    # can redirect with the exact incoming path/query; nothing here is ever
    # cacheable content.
    cache_policy_id = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.redirect.arn
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.redirect.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = local.tags
}

data "aws_iam_policy_document" "unused_origin_cloudfront" {
  statement {
    sid = "AllowCloudFrontRead"

    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.unused_origin.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.redirect.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "unused_origin_cloudfront" {
  bucket = aws_s3_bucket.unused_origin.id
  policy = data.aws_iam_policy_document.unused_origin_cloudfront.json
}

resource "aws_route53_record" "alias_a" {
  for_each = toset(var.domain_names)

  zone_id = var.route53_zone_id
  name    = each.value
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.redirect.domain_name
    zone_id                = aws_cloudfront_distribution.redirect.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "alias_aaaa" {
  for_each = toset(var.domain_names)

  zone_id = var.route53_zone_id
  name    = each.value
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.redirect.domain_name
    zone_id                = aws_cloudfront_distribution.redirect.hosted_zone_id
    evaluate_target_health = false
  }
}

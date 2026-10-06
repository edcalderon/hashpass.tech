locals {
  domain = "lukas.hashpass.tech"
  tags = {
    Project   = "hashpass"
    ManagedBy = "terraform"
    Stack     = "hashpass-lukas-site"
  }
}
data "aws_route53_zone" "tech" {
  name         = "hashpass.tech."
  private_zone = false
}
data "aws_acm_certificate" "wildcard" {
  provider    = aws.use1
  domain      = "*.hashpass.tech"
  statuses    = ["ISSUED"]
  most_recent = true
}
resource "aws_s3_bucket" "site" {
  bucket        = "hashpass-lukas-landing-site"
  force_destroy = false
  tags          = local.tags
}
resource "aws_s3_bucket_public_access_block" "site" {
  bucket                  = aws_s3_bucket.site.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_ownership_controls" "site" {
  bucket = aws_s3_bucket.site.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
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
resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "hashpass-lukas-landing-site"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}
resource "aws_cloudfront_function" "routes" {
  name    = "hashpass-lukas-static-routes"
  runtime = "cloudfront-js-2.0"
  publish = true
  comment = "Serve the restored Lukas landing page and clean static routes."
  code    = <<-JS
    function handler(event) {
      var request = event.request;
      if (request.headers.host.value === 'lks.hashpass.tech') {
        var parts = [];
        var query = request.querystring || {};
        for (var key in query) {
          var values = query[key].multiValue || [query[key]];
          for (var i = 0; i < values.length; i++) {
            // CloudFront event values retain their URL encoding; do not double-encode.
            parts.push(key + '=' + values[i].value);
          }
        }
        return {
          statusCode: 301,
          statusDescription: 'Moved Permanently',
          headers: { location: { value: 'https://lukas.hashpass.tech' + request.uri + (parts.length ? '?' + parts.join('&') : '') } }
        };
      }
      if (request.uri === '/') {
        request.uri = '/index.html';
      } else if (request.uri === '/lukas' || request.uri === '/lukas/' || request.uri === '/lks' || request.uri === '/lks/') {
        request.uri = '/lukas.html';
      } else if (request.uri.endsWith('/')) {
        request.uri += 'index.html';
      } else if (!request.uri.split('/').pop().includes('.')) {
        request.uri += '.html';
      }
      return request;
    }
  JS
}
resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  aliases             = [local.domain, "lks.hashpass.tech"]
  comment             = "Restored original HASHPASS Lukas landing page"
  default_root_object = "index.html"
  price_class         = "PriceClass_100"
  is_ipv6_enabled     = true
  wait_for_deployment = true
  origin {
    origin_id                = "lukas-site"
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }
  default_cache_behavior {
    target_origin_id       = "lukas-site"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    viewer_protocol_policy = "redirect-to-https"
    compress               = true
    min_ttl                = 0
    default_ttl            = 300
    max_ttl                = 86400
    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.routes.arn
    }
  }
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
  viewer_certificate {
    acm_certificate_arn      = data.aws_acm_certificate.wildcard.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
  custom_error_response {
    error_code            = 403
    response_code         = 404
    response_page_path    = "/404.html"
    error_caching_min_ttl = 0
  }
  tags = local.tags
}
resource "aws_s3_bucket_policy" "site" {
  bucket = aws_s3_bucket.site.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontRead"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.site.arn}/*"
      Condition = { StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.site.arn } }
    }]
  })
}
resource "aws_route53_record" "site" {
  for_each = toset(["A", "AAAA"])
  zone_id  = data.aws_route53_zone.tech.zone_id
  name     = local.domain
  type     = each.value
  alias {
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "short_alias" {
  for_each = toset(["A", "AAAA"])
  zone_id  = data.aws_route53_zone.tech.zone_id
  name     = "lks.hashpass.tech"
  type     = each.value
  alias {
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
    evaluate_target_health = false
  }
}

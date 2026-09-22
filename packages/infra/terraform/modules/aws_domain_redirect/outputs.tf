output "cloudfront_distribution_id" {
  description = "CloudFront distribution id for the redirect"
  value       = aws_cloudfront_distribution.redirect.id
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name (the *.cloudfront.net name behind the alias records)"
  value       = aws_cloudfront_distribution.redirect.domain_name
}

output "acm_certificate_arn" {
  description = "Validated ACM certificate ARN (us-east-1) covering domain_names"
  value       = aws_acm_certificate_validation.redirect.certificate_arn
}

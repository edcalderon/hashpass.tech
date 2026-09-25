output "cloudfront_distribution_id" {
  description = "CloudFront distribution id backing the hashpass.app redirect"
  value       = module.app_redirect.cloudfront_distribution_id
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name behind hashpass.app / www.hashpass.app"
  value       = module.app_redirect.cloudfront_domain_name
}

output "acm_certificate_arn" {
  description = "Validated ACM certificate ARN (us-east-1) covering redirect_domain_names"
  value       = module.app_redirect.acm_certificate_arn
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution serving the docs.hashpass.club redirect"
  value       = module.docs_redirect.cloudfront_distribution_id
}

output "cloudfront_domain_name" {
  description = "CloudFront domain behind docs.hashpass.club"
  value       = module.docs_redirect.cloudfront_domain_name
}

output "acm_certificate_arn" {
  description = "Validated ACM certificate covering docs.hashpass.club"
  value       = module.docs_redirect.acm_certificate_arn
}

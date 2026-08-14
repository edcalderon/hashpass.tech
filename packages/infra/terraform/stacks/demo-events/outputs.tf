output "demo_event_domains" {
  description = "Subdomains this stack serves, keyed by event slug."
  value       = { for k, v in var.demo_events : k => v.subdomain }
}

output "cloudfront_distribution_ids" {
  value = { for k, d in aws_cloudfront_distribution.demo : k => d.id }
}

output "cloudfront_domain_names" {
  value = { for k, d in aws_cloudfront_distribution.demo : k => d.domain_name }
}

output "acm_certificate_arns" {
  value = { for k, c in aws_acm_certificate_validation.demo : k => c.certificate_arn }
}

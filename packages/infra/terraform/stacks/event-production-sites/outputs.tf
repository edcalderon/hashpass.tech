output "site_bucket_names" {
  description = "Dedicated static origin bucket for each production event site."
  value       = { for event_id, bucket in aws_s3_bucket.site : event_id => bucket.bucket }
}

output "cloudfront_distribution_ids" {
  description = "CloudFront distribution ID for each production event site."
  value       = { for event_id, distribution in aws_cloudfront_distribution.site : event_id => distribution.id }
}

output "cloudfront_domain_names" {
  description = "CloudFront domain name for each production event site."
  value       = { for event_id, distribution in aws_cloudfront_distribution.site : event_id => distribution.domain_name }
}

output "site_deploy_role_arns" {
  description = "Least-privilege GitHub Actions OIDC publisher role for each event site."
  value       = { for event_id, role in aws_iam_role.site_deploy : event_id => role.arn }
}

output "site_urls" {
  description = "Production URL for each event site."
  value       = { for event_id, site in var.event_sites : event_id => "https://${site.hostname}" }
}

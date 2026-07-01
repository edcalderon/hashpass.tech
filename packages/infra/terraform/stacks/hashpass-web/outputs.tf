output "site_bucket_name" {
  description = "S3 bucket storing the static site"
  value       = module.site.site_bucket_name
}

output "dev_site_bucket_name" {
  description = "S3 bucket storing the development static site"
  value       = module.site_dev.site_bucket_name
}

output "artifact_bucket_name" {
  description = "S3 bucket storing pipeline artifacts"
  value       = module.site.artifact_bucket_name
}

output "dev_artifact_bucket_name" {
  description = "S3 bucket storing development pipeline artifacts"
  value       = module.site_dev.artifact_bucket_name
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID"
  value       = module.site.cloudfront_distribution_id
}

output "dev_cloudfront_distribution_id" {
  description = "Development CloudFront distribution ID"
  value       = module.site_dev.cloudfront_distribution_id
}

output "cloudfront_distribution_domain_name" {
  description = "CloudFront distribution domain name"
  value       = module.site.cloudfront_distribution_domain_name
}

output "dev_cloudfront_distribution_domain_name" {
  description = "Development CloudFront distribution domain name"
  value       = module.site_dev.cloudfront_distribution_domain_name
}

output "site_website_endpoint" {
  description = "S3 website endpoint used when CloudFront is disabled"
  value       = module.site.site_website_endpoint
}

output "dev_site_website_endpoint" {
  description = "Development S3 website endpoint used when CloudFront is disabled"
  value       = module.site_dev.site_website_endpoint
}

output "dev_site_domain_name" {
  description = "Development Route53 alias FQDN"
  value       = aws_route53_record.dev_site.fqdn
}

output "build_worker_instance_ids" {
  description = "EC2 instance IDs for the shared pipeline build worker"
  value       = module.build_worker.instance_ids
}

output "build_worker_public_ips" {
  description = "Public IPs for the shared pipeline build worker"
  value       = module.build_worker.public_ips
}

output "build_worker_private_ips" {
  description = "Private IPs for the shared pipeline build worker"
  value       = module.build_worker.private_ips
}

output "build_worker_dashboard_url" {
  description = "CloudWatch dashboard URL for the shared pipeline build worker"
  value       = module.build_worker.dashboard_url
}

output "build_worker_security_group_id" {
  description = "Security group attached to the shared pipeline build worker"
  value       = module.build_worker.security_group_id
}

output "github_actions_role_arn" {
  description = "IAM role ARN for GitHub Actions to monitor the web pipelines and start/stop the shared EC2 worker. Copy as GitHub variable AWS_WEB_PIPELINE_ROLE_ARN once enable_github_actions_worker_control = true."
  value       = var.enable_github_actions_worker_control ? aws_iam_role.github_actions[0].arn : ""
}

output "build_action_provider_name" {
  description = "Custom CodePipeline build action provider name"
  value       = module.site.build_action_provider_name
}

output "codepipeline_name" {
  description = "CodePipeline name"
  value       = module.site.codepipeline_name
}

output "dev_codepipeline_name" {
  description = "Development CodePipeline name"
  value       = module.site_dev.codepipeline_name
}

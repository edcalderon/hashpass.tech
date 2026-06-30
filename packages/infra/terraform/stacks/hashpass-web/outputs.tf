output "site_bucket_name" {
  description = "S3 bucket storing the static site"
  value       = module.site.site_bucket_name
}

output "dev_site_bucket_name" {
  description = "S3 bucket storing the development static site"
  value       = module.site_dev.site_bucket_name
}

output "artifact_bucket_name" {
  description = "S3 bucket storing pipeline artifacts and cache"
  value       = module.site.artifact_bucket_name
}

output "dev_artifact_bucket_name" {
  description = "S3 bucket storing development pipeline artifacts and cache"
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

output "codebuild_project_name" {
  description = "CodeBuild project name"
  value       = module.site.codebuild_project_name
}

output "dev_codebuild_project_name" {
  description = "Development CodeBuild project name"
  value       = module.site_dev.codebuild_project_name
}

output "codepipeline_name" {
  description = "CodePipeline name"
  value       = module.site.codepipeline_name
}

output "dev_codepipeline_name" {
  description = "Development CodePipeline name"
  value       = module.site_dev.codepipeline_name
}

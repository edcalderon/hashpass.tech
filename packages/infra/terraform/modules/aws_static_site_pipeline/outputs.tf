output "site_bucket_name" {
  description = "S3 bucket name that stores the static site"
  value       = aws_s3_bucket.site.bucket
}

output "artifact_bucket_name" {
  description = "S3 bucket name used for pipeline artifacts"
  value       = aws_s3_bucket.artifacts.bucket
}

output "site_bucket_hosted_zone_id" {
  description = "Route 53 hosted zone ID for the site bucket website endpoint"
  value       = aws_s3_bucket.site.hosted_zone_id
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID"
  value       = var.enable_cloudfront ? aws_cloudfront_distribution.site[0].id : null
}

output "cloudfront_distribution_domain_name" {
  description = "CloudFront distribution domain name"
  value       = var.enable_cloudfront ? aws_cloudfront_distribution.site[0].domain_name : null
}

output "cloudfront_distribution_hosted_zone_id" {
  description = "Route 53 hosted zone ID for the CloudFront distribution"
  value       = var.enable_cloudfront ? aws_cloudfront_distribution.site[0].hosted_zone_id : null
}

output "custom_domain_name" {
  description = "Optional CloudFront custom domain name"
  value       = local.custom_domain_name
}

output "build_action_provider_name" {
  description = "CodePipeline custom action provider name"
  value       = var.build_action_provider_name
}

output "codepipeline_name" {
  description = "CodePipeline name"
  value       = aws_codepipeline.site.name
}

output "deploy_mode" {
  description = "Deployment mode used by the pipeline"
  value       = var.deploy_mode
}

output "site_website_endpoint" {
  description = "S3 website endpoint used when CloudFront is disabled"
  value       = var.enable_cloudfront ? null : "http://${aws_s3_bucket_website_configuration.site[0].website_endpoint}"
}

output "site_bucket_name" {
  description = "S3 bucket name that stores the static site"
  value       = aws_s3_bucket.site.bucket
}

output "artifact_bucket_name" {
  description = "S3 bucket name used for pipeline artifacts and CodeBuild cache"
  value       = aws_s3_bucket.artifacts.bucket
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID"
  value       = var.enable_cloudfront ? aws_cloudfront_distribution.site[0].id : null
}

output "cloudfront_distribution_domain_name" {
  description = "CloudFront distribution domain name"
  value       = var.enable_cloudfront ? aws_cloudfront_distribution.site[0].domain_name : null
}

output "codebuild_project_name" {
  description = "CodeBuild project name"
  value       = aws_codebuild_project.site.name
}

output "codepipeline_name" {
  description = "CodePipeline name"
  value       = aws_codepipeline.site.name
}

output "site_website_endpoint" {
  description = "S3 website endpoint used when CloudFront is disabled"
  value       = var.enable_cloudfront ? null : "http://${aws_s3_bucket_website_configuration.site[0].website_endpoint}"
}

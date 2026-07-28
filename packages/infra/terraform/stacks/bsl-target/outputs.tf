output "worker_instance_ids" {
  description = "EC2 instance IDs for the BSL build worker fleet"
  value       = module.build_worker.instance_ids
}

output "worker_dashboard_url" {
  description = "Console URL for the BSL build worker CloudWatch dashboard"
  value       = module.build_worker.dashboard_url
}

output "prod_pipeline_name" {
  description = "Name of the production BSL CodePipeline"
  value       = aws_codepipeline.bsl_prod.name
}

output "dev_pipeline_name" {
  description = "Name of the dev BSL CodePipeline"
  value       = aws_codepipeline.bsl_dev.name
}

output "bsl_dev_site_bucket" {
  description = "Target-account S3 bucket name for the hybrid bsl-dev static site"
  value       = aws_s3_bucket.bsl_dev_site.bucket
}

output "bsl_dev_site_website_endpoint" {
  description = "S3 website endpoint to use as the source-account CloudFront distribution's origin"
  value       = aws_s3_bucket_website_configuration.bsl_dev_site.website_endpoint
}

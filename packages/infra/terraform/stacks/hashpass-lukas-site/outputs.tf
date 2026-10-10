output "bucket_name" {
  value = aws_s3_bucket.site.id
}
output "distribution_id" {
  value = aws_cloudfront_distribution.site.id
}
output "site_url" {
  value = "https://${local.domain}"
}

output "github_actions_deploy_role_arn" {
  description = "Dedicated GitHub Actions OIDC role ARN; set as the production AWS_LUKAS_DEPLOY_ROLE_ARN variable."
  value       = aws_iam_role.github_actions.arn
  sensitive   = true
}

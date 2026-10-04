output "site_url" {
  description = "Public URL once the registrar's NS records are cut over and enable_custom_domain = true."
  value       = "https://${var.domain_name}"
}

output "cloudfront_domain_name" {
  description = "Default *.cloudfront.net hostname -- resolves immediately, with no DNS dependency, regardless of enable_custom_domain."
  value       = aws_cloudfront_distribution.site.domain_name
}

output "cloudfront_distribution_id" {
  value = aws_cloudfront_distribution.site.id
}

output "s3_bucket_name" {
  description = "Deploy target: `aws s3 sync apps/localpass/dist s3://<this>/ --delete --profile hashpass`."
  value       = aws_s3_bucket.site.bucket
}

output "acm_certificate_arn" {
  description = "Check validation status with: aws acm describe-certificate --certificate-arn <this> --region us-east-1 --profile hashpass --query Certificate.Status"
  value       = aws_acm_certificate.site.arn
}

output "hosted_zone_id" {
  value = data.aws_route53_zone.this.zone_id
}

output "name_servers" {
  description = "Set these as localproof.org's NS records at the registrar (Spaceship) -- required for public resolution and for ACM DNS validation to ever succeed."
  value       = data.aws_route53_zone.this.name_servers
}

output "apex_target" {
  description = "What currently serves the apex + www: this stack's own CloudFront (\"cloudfront\") or GitHub Pages (\"github_pages\")."
  value       = var.apex_target
}

output "app_site_url" {
  description = "apps/localpass's PWA URL once apex_target = \"github_pages\" moves the apex to GitHub Pages. Same value as site_url while apex_target = \"cloudfront\", since the app is still reachable at the apex in that mode."
  value       = var.apex_target == "github_pages" ? "https://${var.app_subdomain_name}" : "https://${var.domain_name}"
}

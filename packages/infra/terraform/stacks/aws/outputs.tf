output "site_cloudfront_distribution_id" {
  description = "CloudFront distribution ID for the hashpass.tech front door"
  value       = aws_cloudfront_distribution.site.id
}

output "site_cloudfront_distribution_domain_name" {
  description = "CloudFront distribution domain name for the hashpass.tech front door"
  value       = aws_cloudfront_distribution.site.domain_name
}

output "site_origin_domain_name" {
  description = "Origin domain name behind the hashpass.tech CloudFront front door"
  value       = local.site_origin_domain_name
}

output "site_acm_certificate_arn" {
  description = "ACM certificate ARN for the hashpass.tech front door"
  value       = aws_acm_certificate_validation.site.certificate_arn
}

output "frontend_domain_association_arn" {
  description = "Amplify frontend domain association ARN"
  value       = var.create_amplify_domain_association ? module.frontend_domain_association[0].domain_association_arn : null
}

output "frontend_certificate_verification_dns_record" {
  description = "DNS record for Amplify SSL verification"
  value       = var.create_amplify_domain_association ? module.frontend_domain_association[0].certificate_verification_dns_record : null
}

output "frontend_branches" {
  description = "Amplify frontend branches managed by Terraform"
  value = {
    for branch_name, branch in aws_amplify_branch.frontend : branch_name => {
      arn               = branch.arn
      stage             = branch.stage
      enable_auto_build = branch.enable_auto_build
    }
  }
}

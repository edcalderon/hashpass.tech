output "api_base_urls" {
  description = "API base URLs consumed by the frontend"
  value = {
    dev  = module.api_dev.api_base_url
    prod = module.api_prod.api_base_url
  }
}

output "api_custom_domains" {
  description = "Custom API domains"
  value = {
    dev  = module.api_dev.custom_domain_name
    prod = module.api_prod.custom_domain_name
  }
}

output "lambda_functions" {
  description = "Lambda function names"
  value = {
    dev  = module.api_dev.lambda_function_name
    prod = module.api_prod.lambda_function_name
  }
}

output "frontend_domain_association_arn" {
  description = "Amplify frontend domain association ARN"
  value       = var.create_amplify_domain_association ? module.frontend_domain_association[0].domain_association_arn : null
}

output "frontend_certificate_verification_dns_record" {
  description = "DNS record for Amplify SSL verification"
  value       = var.create_amplify_domain_association ? module.frontend_domain_association[0].certificate_verification_dns_record : null
}
<<<<<<< Updated upstream

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
=======
>>>>>>> Stashed changes

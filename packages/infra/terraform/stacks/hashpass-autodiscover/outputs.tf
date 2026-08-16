output "default_invoke_url" {
  description = "Raw execute-api URL, for testing before enable_custom_domain is flipped on"
  value       = module.autodiscover.api_default_invoke_url
}

output "lambda_function_name" {
  value = module.autodiscover.lambda_function_name
}

output "custom_domain_name" {
  value = module.autodiscover.custom_domain_name
}

output "custom_domain_target" {
  description = "Regional target for the Route53 alias record, once enable_custom_domain = true"
  value       = module.autodiscover.custom_domain_target
}

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

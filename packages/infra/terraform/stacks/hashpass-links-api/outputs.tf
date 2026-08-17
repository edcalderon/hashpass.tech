# NOTE: intentionally NOT using the aws_expo_router_api module's own
# api_base_url output here -- that output appends "/api" on the assumption
# routes are mounted without that prefix (the Expo Router API's convention).
# This service's own routes already include the literal "/api/..." prefix
# themselves (see packages/hashpass-links-api/src/router.ts), and so does
# every path the SDK's AuthQrClient requests (packages/sdk/src/auth-qr/client.ts).
# Appending "/api" again here would double it up ("/api/api/v1/..."). These
# outputs are therefore the bare origin -- exactly what
# NEXT_PUBLIC_LINKS_API_BASE_URL / EXPO_PUBLIC_LINKS_API_BASE_URL expect.
output "links_api_base_urls" {
  description = "Bare API origin per environment for NEXT_PUBLIC_LINKS_API_BASE_URL / EXPO_PUBLIC_LINKS_API_BASE_URL"
  value = {
    dev  = var.enable_custom_domain ? "https://${module.links_api_dev.custom_domain_name}" : module.links_api_dev.api_default_invoke_url
    prod = var.enable_custom_domain ? "https://${module.links_api_prod.custom_domain_name}" : module.links_api_prod.api_default_invoke_url
  }
}

output "lambda_functions" {
  description = "Lambda function names"
  value = {
    dev  = module.links_api_dev.lambda_function_name
    prod = module.links_api_prod.lambda_function_name
  }
}

output "extra_domain_base_urls" {
  description = "Additional public origins mapped onto the prod links API (null until each domain's enable_* flag is true)"
  value = {
    hpass_id   = var.enable_hpass_id_domain ? "https://${module.links_extra_domain_hpass_id[0].domain_name}" : null
    hashp_link = var.enable_hashp_link_domain ? "https://${module.links_extra_domain_hashp_link[0].domain_name}" : null
  }
}

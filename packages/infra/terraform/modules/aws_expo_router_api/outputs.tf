output "lambda_function_name" {
  description = "Lambda function name"
  value       = aws_lambda_function.api_router.function_name
}

output "lambda_function_arn" {
  description = "Lambda function ARN"
  value       = aws_lambda_function.api_router.arn
}

output "api_id" {
  description = "HTTP API ID"
  value       = aws_apigatewayv2_api.http_api.id
}

output "api_execution_arn" {
  description = "HTTP API execution ARN"
  value       = aws_apigatewayv2_api.http_api.execution_arn
}

output "api_default_invoke_url" {
  description = "Default invoke URL for the API"
  value       = aws_apigatewayv2_stage.default.invoke_url
}

output "custom_domain_name" {
  description = "Custom API domain"
  value       = aws_apigatewayv2_domain_name.api.domain_name
}

output "custom_domain_target" {
  description = "Regional target domain used by Route53 alias"
  value       = aws_apigatewayv2_domain_name.api.domain_name_configuration[0].target_domain_name
}

output "api_base_url" {
  description = "Base URL including mapping key"
  value       = local.mapping_key == null ? "https://${var.domain_name}" : "https://${var.domain_name}/${local.mapping_key}"
}

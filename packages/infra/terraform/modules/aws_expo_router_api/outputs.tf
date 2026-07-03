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
  value       = var.enable_custom_domain ? aws_apigatewayv2_domain_name.api[0].domain_name : null
}

output "custom_domain_target" {
  description = "Regional target domain used by Route53 alias"
  value       = var.enable_custom_domain ? aws_apigatewayv2_domain_name.api[0].domain_name_configuration[0].target_domain_name : null
}

output "api_base_url" {
  description = "Base URL including mapping key"
  value       = var.enable_custom_domain ? "https://${var.domain_name}/api" : "${aws_apigatewayv2_stage.default.invoke_url}/api"
}

output "domain_name" {
  description = "The custom domain name that was mapped"
  value       = aws_apigatewayv2_domain_name.domain.domain_name
}

output "target_domain_name" {
  description = "Regional target domain used by the Route53 alias"
  value       = aws_apigatewayv2_domain_name.domain.domain_name_configuration[0].target_domain_name
}

output "certificate_arn" {
  description = "ARN of the validated ACM certificate for this domain"
  value       = aws_acm_certificate_validation.domain.certificate_arn
}

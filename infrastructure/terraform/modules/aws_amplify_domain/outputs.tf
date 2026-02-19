output "domain_association_arn" {
  description = "Amplify domain association ARN"
  value       = aws_amplify_domain_association.this.arn
}

output "certificate_verification_dns_record" {
  description = "DNS record used to verify SSL certificate"
  value       = aws_amplify_domain_association.this.certificate_verification_dns_record
}

output "sub_domains" {
  description = "Amplify-managed subdomain records"
  value       = aws_amplify_domain_association.this.sub_domain
}

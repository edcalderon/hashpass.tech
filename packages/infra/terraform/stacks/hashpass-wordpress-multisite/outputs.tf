output "instance_name" {
  description = "Lightsail instance name."
  value       = aws_lightsail_instance.wordpress.name
}

output "static_ip" {
  description = "Public static IPv4 address for the editorial WordPress network."
  value       = aws_lightsail_static_ip.wordpress.ip_address
}

output "site_urls" {
  description = "Target public site URLs after WordPress domain mapping and DNS/TLS setup."
  value       = ["https://hashpass.blog", "https://hashpass.news"]
}

output "dns_records_managed" {
  description = "Whether this stack manages the two Route 53 A records."
  value       = var.enable_dns_records
}

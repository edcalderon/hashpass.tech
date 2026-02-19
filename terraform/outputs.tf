output "app_service_name" {
  description = "Name of the deployed App Service"
  value       = azurerm_linux_web_app.app.name
}

output "app_service_url" {
  description = "Default hostname for the App Service"
  value       = azurerm_linux_web_app.app.default_hostname
}

output "app_service_fqdn" {
  description = "Fully qualified domain name"
  value       = "https://${azurerm_linux_web_app.app.default_hostname}"
}

output "resource_group_id" {
  description = "Resource group ID"
  value       = azurerm_resource_group.rg.id
}

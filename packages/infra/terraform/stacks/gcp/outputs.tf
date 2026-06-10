output "directus_instance_names" {
  description = "Directus VM names by environment"
  value       = { for env, module_ref in module.directus : env => module_ref.instance_name }
}

output "directus_external_ips" {
  description = "Directus static external IPs by environment"
  value       = { for env, module_ref in module.directus : env => module_ref.external_ip }
}

output "directus_domains" {
  description = "Directus domains by environment"
  value       = { for env, module_ref in module.directus : env => module_ref.domain_name }
}

output "directus_ssh_commands" {
  description = "SSH commands by environment"
  value       = { for env, module_ref in module.directus : env => module_ref.ssh_command }
}

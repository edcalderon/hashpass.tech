locals {
  selected_environments = toset(var.environments)
}

check "domain_names_cover_all_environments" {
  assert {
    condition     = alltrue([for env in var.environments : contains(keys(var.domain_names), env)])
    error_message = "domain_names must include entries for all environments."
  }
}

check "directus_env_source_cover_all_environments" {
  assert {
    condition = alltrue([
      for env in var.environments : (
        (contains(keys(var.directus_env_secret_ids), env) && trimspace(lookup(var.directus_env_secret_ids, env, "")) != "") ||
        (contains(keys(var.directus_env_inline), env) && trimspace(lookup(var.directus_env_inline, env, "")) != "") ||
        (contains(keys(var.directus_env_file_paths), env) && trimspace(lookup(var.directus_env_file_paths, env, "")) != "")
      )
    ])
    error_message = "Provide directus env source for each environment using directus_env_secret_ids, directus_env_inline, or directus_env_file_paths."
  }
}

check "dns_zone_required_when_enabled" {
  assert {
    condition     = !var.enable_dns_records || trimspace(var.dns_managed_zone_name == null ? "" : var.dns_managed_zone_name) != ""
    error_message = "dns_managed_zone_name must be set when enable_dns_records is true."
  }
}

check "service_accounts_cover_all_environments" {
  assert {
    condition = var.create_service_accounts || alltrue([
      for env in var.environments :
      contains(keys(var.existing_service_account_emails), env) && trimspace(var.existing_service_account_emails[env]) != ""
    ])
    error_message = "existing_service_account_emails must include non-empty values for all environments when create_service_accounts is false."
  }
}

module "directus" {
  for_each = local.selected_environments

  source = "../../modules/gcp_directus_instance"

  project_id = var.project_id
  region     = var.region
  zone       = var.zone

  name_prefix = var.name_prefix
  environment = each.value

  domain_name               = lookup(var.domain_names, each.value)
  directus_env_secret_id    = lookup(var.directus_env_secret_ids, each.value, null)
  directus_env_inline       = contains(keys(var.directus_env_file_paths), each.value) ? file(var.directus_env_file_paths[each.value]) : lookup(var.directus_env_inline, each.value, null)
  manage_project_services   = var.manage_project_services
  required_project_services = var.required_project_services

  machine_type = lookup(var.machine_types, each.value, "e2-micro")

  create_service_account = var.create_service_accounts
  service_account_email  = var.create_service_accounts ? null : lookup(var.existing_service_account_emails, each.value, null)

  startup_repository_url = var.startup_repository_url
  startup_repository_ref = var.startup_repository_ref
  directus_compose_path  = var.directus_compose_path
  directus_compose_inline = contains(keys(var.directus_compose_file_paths), each.value) ? file(var.directus_compose_file_paths[each.value]) : lookup(var.directus_compose_inline, each.value, null)
  directus_env_file_path = var.directus_env_file_path

  network                = var.network
  firewall_source_ranges = var.firewall_source_ranges

  enable_dns_record     = var.enable_dns_records
  dns_managed_zone_name = var.dns_managed_zone_name

  tags = var.tags

  labels = merge(var.labels, {
    environment = each.value
  })
}

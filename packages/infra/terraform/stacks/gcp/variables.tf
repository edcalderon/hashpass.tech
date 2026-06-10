variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "GCP zone"
  type        = string
  default     = "us-central1-a"
}

variable "name_prefix" {
  description = "Resource naming prefix"
  type        = string
  default     = "hashpass"
}

variable "environments" {
  description = "Environments to deploy (dev, prod)"
  type        = list(string)
  default     = ["dev", "prod"]
}

variable "domain_names" {
  description = "Domain names by environment"
  type        = map(string)
  default = {
    dev  = "sso-dev.hashpass.co"
    prod = "sso.hashpass.co"
  }
}

variable "directus_env_secret_ids" {
  description = "Secret Manager secret IDs containing full Directus .env content by environment"
  type        = map(string)
  default     = {}
}

variable "directus_env_inline" {
  description = "Directus .env content by environment (inline values)"
  type        = map(string)
  default     = {}
  sensitive   = true
}

variable "directus_env_file_paths" {
  description = "Filesystem paths to Directus .env files by environment"
  type        = map(string)
  default     = {}
}

variable "manage_project_services" {
  description = "Whether Terraform should attempt to enable required GCP project services"
  type        = bool
  default     = false
}

variable "required_project_services" {
  description = "Project services to enable when manage_project_services=true"
  type        = list(string)
  default = [
    "compute.googleapis.com",
    "dns.googleapis.com"
  ]
}

variable "machine_types" {
  description = "Machine type by environment"
  type        = map(string)
  default = {
    dev  = "e2-micro"
    prod = "e2-micro"
  }
}

variable "create_service_accounts" {
  description = "Create dedicated service accounts per environment"
  type        = bool
  default     = true
}

variable "existing_service_account_emails" {
  description = "Existing service account emails by environment when create_service_accounts=false"
  type        = map(string)
  default     = {}
}

variable "startup_repository_url" {
  description = "Git repository URL pulled by VM startup"
  type        = string
  default     = "https://github.com/edcalderon/hashpass.tech.git"
}

variable "startup_repository_ref" {
  description = "Git ref (branch/tag) checked out by VM startup"
  type        = string
  default     = "main"
}

variable "directus_compose_path" {
  description = "Path to Directus docker compose file inside repository"
  type        = string
  default     = "apps/directus/docker-compose.yml"
}

variable "directus_compose_inline" {
  description = "Directus docker-compose.yml content by environment (inline values)"
  type        = map(string)
  default     = {}
  sensitive   = true
}

variable "directus_compose_file_paths" {
  description = "Filesystem paths to Directus docker-compose.yml files by environment"
  type        = map(string)
  default     = {}
}

variable "directus_env_file_path" {
  description = "Absolute path where startup script writes Directus env file"
  type        = string
  default     = "/etc/hashpass/directus.env"
}

variable "network" {
  description = "VPC network name"
  type        = string
  default     = "default"
}

variable "firewall_source_ranges" {
  description = "Source ranges allowed for inbound ports"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "enable_dns_records" {
  description = "Create Cloud DNS A records for sso domains"
  type        = bool
  default     = false
}

variable "dns_managed_zone_name" {
  description = "Cloud DNS managed zone name for hashpass.co"
  type        = string
  default     = null
}

variable "tags" {
  description = "Additional network tags applied to Directus instances"
  type        = list(string)
  default     = []
}

variable "labels" {
  description = "Labels applied to Directus instances"
  type        = map(string)
  default     = {}
}

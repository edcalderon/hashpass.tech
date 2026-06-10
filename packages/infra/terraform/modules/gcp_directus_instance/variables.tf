variable "project_id" {
  description = "GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
}

variable "zone" {
  description = "GCP zone"
  type        = string
}

variable "environment" {
  description = "Environment name (dev/prod)"
  type        = string
}

variable "name_prefix" {
  description = "Resource naming prefix"
  type        = string
  default     = "hashpass"
}

variable "domain_name" {
  description = "Public domain for Directus (for example sso.hashpass.co)"
  type        = string
}

variable "machine_type" {
  description = "Compute instance machine type"
  type        = string
  default     = "e2-micro"
}

variable "boot_disk_size_gb" {
  description = "Boot disk size in GB"
  type        = number
  default     = 20
}

variable "boot_image" {
  description = "Boot image for the VM"
  type        = string
  default     = "debian-cloud/debian-12"
}

variable "network" {
  description = "VPC network name"
  type        = string
  default     = "default"
}

variable "create_service_account" {
  description = "Create a dedicated service account for the VM"
  type        = bool
  default     = true
}

variable "service_account_email" {
  description = "Existing service account email (required when create_service_account=false)"
  type        = string
  default     = null
}

variable "directus_env_secret_id" {
  description = "Secret Manager secret ID containing the full Directus .env content"
  type        = string
  default     = null
}

variable "directus_env_inline" {
  description = "Full Directus .env content passed inline (used when Secret Manager is unavailable)"
  type        = string
  default     = null
  sensitive   = true
}

variable "manage_project_services" {
  description = "Whether Terraform should enable required project services"
  type        = bool
  default     = true
}

variable "required_project_services" {
  description = "Project services enabled by Terraform when manage_project_services=true"
  type        = list(string)
  default = [
    "compute.googleapis.com",
    "dns.googleapis.com",
    "secretmanager.googleapis.com"
  ]
}

variable "startup_repository_url" {
  description = "Git repository URL used to pull the app code on boot"
  type        = string
}

variable "startup_repository_ref" {
  description = "Git branch or tag checked out on startup"
  type        = string
  default     = "main"
}

variable "directus_compose_path" {
  description = "Path to directus docker compose file inside repo"
  type        = string
  default     = "apps/directus/docker-compose.yml"
}

variable "directus_compose_inline" {
  description = "Directus docker-compose.yml content passed inline (used when repo path is unavailable)"
  type        = string
  default     = null
  sensitive   = true
}

variable "directus_env_file_path" {
  description = "Absolute path where fetched .env should be written"
  type        = string
  default     = "/etc/hashpass/directus.env"
}

variable "open_ports" {
  description = "TCP ports opened in firewall"
  type        = list(number)
  default     = [22, 80, 443]
}

variable "firewall_source_ranges" {
  description = "Source CIDR ranges allowed to access open ports"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "enable_dns_record" {
  description = "Create an A record in Cloud DNS pointing the domain to this VM"
  type        = bool
  default     = false
}

variable "dns_managed_zone_name" {
  description = "Cloud DNS managed zone name for the domain"
  type        = string
  default     = null
}

variable "dns_record_ttl" {
  description = "DNS TTL for the A record"
  type        = number
  default     = 300
}

variable "tags" {
  description = "Additional network tags for VM"
  type        = list(string)
  default     = []
}

variable "labels" {
  description = "Labels attached to the VM"
  type        = map(string)
  default     = {}
}

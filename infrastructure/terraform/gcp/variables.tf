# GCP Configuration
variable "project_id" {
  description = "The GCP project ID"
  type        = string
  default     = "hashpass-465304"
}

variable "gcp_credentials_path" {
  description = "Path to GCP service account credentials JSON file"
  type        = string
  default     = "../../keys/gcp-credentials.json"
}

variable "region" {
  description = "The GCP region for resources"
  type        = string
  default     = "us-central1"
}

variable "zone" {
  description = "The GCP zone for the compute instance"
  type        = string
  default     = "us-central1-a"
}

# Directus Configuration
variable "directus_key" {
  description = "Secret key for Directus - DO NOT SET DEFAULT, use TF_VAR_directus_key or .tfvars file"
  type        = string
  sensitive   = true
}

variable "directus_secret" {
  description = "Secret for Directus JWT tokens - DO NOT SET DEFAULT, use TF_VAR_directus_secret or .tfvars file"
  type        = string
  sensitive   = true
}

variable "admin_email" {
  description = "Admin email for Directus"
  type        = string
}

variable "admin_password" {
  description = "Admin password for Directus - DO NOT SET DEFAULT, use TF_VAR_admin_password or .tfvars file"
  type        = string
  sensitive   = true
}

# Database Configuration
variable "database_host" {
  description = "Database host"
  type        = string
}

variable "database_password" {
  description = "Database password"
  type        = string
  sensitive   = true
  default     = "temp-password-change-me"
}

variable "database_user" {
  description = "Database user"
  type        = string
  default     = "postgres"
}

variable "database_name" {
  description = "Database name"
  type        = string
  default     = "postgres"
}

variable "database_port" {
  description = "Database port"
  type        = number
  default     = 5432
}
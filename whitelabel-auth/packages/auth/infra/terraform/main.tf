terraform {
  required_version = ">= 1.0"
  required_providers {
    supabase = {
      source  = "supabase/supabase"
      version = "~> 1.0"
    }
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 3.0"
    }
  }
}

variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "whitelabel-auth"
}

variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "region" {
  description = "Deployment region"
  type        = string
  default     = "us-east-1"
}

variable "supabase_access_token" {
  description = "Supabase access token"
  type        = string
  sensitive   = true
}

variable "supabase_db_password" {
  description = "Supabase database password"
  type        = string
  sensitive   = true
}

variable "directus_admin_email" {
  description = "Directus admin email"
  type        = string
  default     = "admin@example.com"
}

variable "directus_admin_password" {
  description = "Directus admin password"
  type        = string
  sensitive   = true
}

variable "google_client_id" {
  description = "Google OAuth client ID"
  type        = string
  default     = ""
}

variable "google_client_secret" {
  description = "Google OAuth client secret"
  type        = string
  sensitive   = true
  default     = ""
}

variable "github_client_id" {
  description = "GitHub OAuth client ID"
  type        = string
  default     = ""
}

variable "github_client_secret" {
  description = "GitHub OAuth client secret"
  type        = string
  sensitive   = true
  default     = ""
}

variable "site_url" {
  description = "Main site URL"
  type        = string
  default     = "http://localhost:3000"
}

variable "allowed_redirect_urls" {
  description = "Allowed redirect URLs"
  type        = list(string)
  default     = ["http://localhost:3000/auth/callback"]
}

# Supabase Project
resource "supabase_project" "main" {
  organization_id   = var.supabase_org_id
  name              = "${var.project_name}-${var.environment}"
  region            = var.region
  database_password = var.supabase_db_password

  lifecycle {
    ignore_changes = [database_password]
  }
}

# Supabase Auth Configuration
resource "supabase_auth" "main" {
  project_ref = supabase_project.main.ref

  site_url                = var.site_url
  additional_redirect_urls = var.allowed_redirect_urls

  # Enable OAuth providers
  external_providers = {
    google = {
      enabled       = var.google_client_id != ""
      client_id     = var.google_client_id
      secret        = var.google_client_secret
      redirect_uri  = "${var.site_url}/auth/callback"
    }
    github = {
      enabled       = var.github_client_id != ""
      client_id     = var.github_client_id
      secret        = var.github_client_secret
      redirect_uri  = "${var.site_url}/auth/callback"
    }
  }
}

# Supabase Database Extensions
resource "supabase_db_extension" "pgcrypto" {
  project_ref = supabase_project.main.ref
  name        = "pgcrypto"
  enabled     = true
}

# Directus Container
resource "docker_container" "directus" {
  name  = "${var.project_name}-directus-${var.environment}"
  image = "directus/directus:11.3.5"

  env = [
    "KEY=${random_password.directus_key.result}",
    "SECRET=${random_password.directus_secret.result}",
    "ADMIN_EMAIL=${var.directus_admin_email}",
    "ADMIN_PASSWORD=${var.directus_admin_password}",
    "DB_CLIENT=pg",
    "DB_CONNECTION_STRING=postgresql://postgres:${var.supabase_db_password}@db.${supabase_project.main.ref}.supabase.co:5432/postgres",
    "AUTH_PROVIDERS=${local.auth_providers}",
    "AUTH_GOOGLE_DRIVER=openid",
    "AUTH_GOOGLE_CLIENT_ID=${var.google_client_id}",
    "AUTH_GOOGLE_CLIENT_SECRET=${var.google_client_secret}",
    "AUTH_GITHUB_DRIVER=oauth2",
    "AUTH_GITHUB_CLIENT_ID=${var.github_client_id}",
    "AUTH_GITHUB_CLIENT_SECRET=${var.github_client_secret}",
    "PUBLIC_URL=${var.site_url}",
    "CORS_ENABLED=true",
    "CORS_ORIGIN=${var.site_url}",
    "SUPABASE_URL=https://${supabase_project.main.ref}.supabase.co",
    "SUPABASE_SERVICE_KEY=${supabase_project.main.service_role_key}",
  ]

  ports {
    internal = 8055
    external = 8055
  }

  networks_advanced {
    name = docker_network.auth_network.name
  }
}

# Docker Network
resource "docker_network" "auth_network" {
  name = "${var.project_name}-network-${var.environment}"
}

# Random Passwords
resource "random_password" "directus_key" {
  length  = 32
  special = false
}

resource "random_password" "directus_secret" {
  length  = 32
  special = true
}

# Local values
locals {
  auth_providers = join(",", compact([
    var.google_client_id != "" ? "google" : "",
    var.github_client_id != "" ? "github" : ""
  ]))
}

# Outputs
output "supabase_project_ref" {
  value = supabase_project.main.ref
}

output "supabase_url" {
  value = "https://${supabase_project.main.ref}.supabase.co"
}

output "supabase_anon_key" {
  value     = supabase_project.main.anon_key
  sensitive = true
}

output "supabase_service_role_key" {
  value     = supabase_project.main.service_role_key
  sensitive = true
}

output "directus_url" {
  value = "http://localhost:8055"
}

output "directus_container_name" {
  value = docker_container.directus.name
}

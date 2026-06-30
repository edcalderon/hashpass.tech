variable "aws_region" {
  description = "AWS region for the target static site pipeline"
  type        = string
  default     = "us-east-2"
}

variable "name_prefix" {
  description = "Prefix used for resource names"
  type        = string
  default     = "hashpass"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "production"
}

variable "repository" {
  description = "GitHub repository in owner/name form"
  type        = string
  default     = "hashpass-tech/hashpass.tech"
}

variable "branch_name" {
  description = "Git branch deployed to the target account"
  type        = string
  default     = "main"
}

variable "connection_arn" {
  description = "AWS CodeConnections ARN for the GitHub source connection"
  type        = string
}

variable "supabase_url" {
  description = "Public Supabase URL for the production web build"
  type        = string
}

variable "supabase_key" {
  description = "Public Supabase anon key for the production web build"
  type        = string
}

variable "supabase_url_dev" {
  description = "Public Supabase URL for the development web build"
  type        = string
  default     = ""
}

variable "supabase_key_dev" {
  description = "Public Supabase anon key for the development web build"
  type        = string
  default     = ""
}

variable "google_client_id" {
  description = "Google OAuth client ID used during the web build"
  type        = string
  default     = ""
}

variable "enable_cloudfront" {
  description = "Whether to create CloudFront in the target account. Disable while the account cannot create new CloudFront resources."
  type        = bool
  default     = false
}

variable "dev_environment" {
  description = "Deployment environment name for the development pipeline"
  type        = string
  default     = "dev"
}

variable "dev_branch_name" {
  description = "Git branch deployed by the development pipeline"
  type        = string
  default     = "develop"
}

variable "dev_enable_cloudfront" {
  description = "Whether to create CloudFront for the development pipeline"
  type        = bool
  default     = false
}

variable "site_bucket_name" {
  description = "Optional explicit S3 bucket name for the site"
  type        = string
  default     = null
}

variable "artifact_bucket_name" {
  description = "Optional explicit S3 bucket name for pipeline artifacts"
  type        = string
  default     = null
}

variable "dev_site_bucket_name" {
  description = "Optional explicit S3 bucket name for the development site"
  type        = string
  default     = null
}

variable "dev_artifact_bucket_name" {
  description = "Optional explicit S3 bucket name for development pipeline artifacts"
  type        = string
  default     = null
}

variable "build_environment_overrides" {
  description = "Additional CodeBuild environment variables"
  type        = map(string)
  default     = {}
}

variable "tags" {
  description = "Tags applied to all resources"
  type        = map(string)
  default = {
    Project = "hashpass"
    Owner   = "platform"
  }
}

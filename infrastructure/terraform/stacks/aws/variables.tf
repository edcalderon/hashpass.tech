variable "aws_region" {
  description = "AWS region for API Gateway and Lambda"
  type        = string
  default     = "us-east-1"
}

<<<<<<< Updated upstream
variable "amplify_region" {
  description = "AWS region for Amplify frontend app and domain association (defaults to aws_region)"
  type        = string
  default     = null
}

=======
>>>>>>> Stashed changes
variable "name_prefix" {
  description = "Prefix used for resource names"
  type        = string
  default     = "hashpass"
}

variable "route53_zone_tech_name" {
  description = "Route53 hosted zone name for API domains"
  type        = string
  default     = "hashpass.tech"
}

variable "route53_zone_lat_name" {
  description = "Route53 hosted zone name for frontend domains"
  type        = string
  default     = "hashpass.lat"
}

variable "api_mapping_key" {
  description = "API mapping key exposed on custom domains"
  type        = string
  default     = "api"
}

variable "lambda_zip_path" {
  description = "Path to packaged Lambda ZIP"
  type        = string
  default     = "../../../../lambda-deployment.zip"
}

variable "lambda_source_code_hash" {
  description = "Optional source hash for Lambda package"
  type        = string
  default     = null
}

variable "lambda_handler" {
  description = "Lambda handler"
  type        = string
  default     = "index.handler"
}

variable "lambda_runtime" {
  description = "Lambda runtime"
  type        = string
  default     = "nodejs22.x"
}

variable "lambda_memory_size" {
  description = "Lambda memory size"
  type        = number
  default     = 1024
}

variable "lambda_timeout" {
  description = "Lambda timeout seconds"
  type        = number
  default     = 30
}

variable "directus_urls" {
  description = "Directus URL per environment"
  type        = map(string)
  default = {
    dev  = "https://sso-dev.hashpass.co"
    prod = "https://sso.hashpass.co"
  }
}

variable "lambda_environment_overrides" {
  description = "Additional Lambda environment variables by environment"
  type        = map(map(string))
  default     = {}
}

variable "api_cors_origins" {
  description = "Allowed CORS origins by environment"
  type        = map(list(string))
  default = {
    dev = [
      "http://localhost:8081",
      "https://blockchainsummit-dev.hashpass.lat",
      "https://blockchainsummit.hashpass.lat"
    ]
    prod = [
      "https://blockchainsummit.hashpass.lat",
      "https://blockchainsummit-dev.hashpass.lat"
    ]
  }
}

variable "create_amplify_domain_association" {
  description = "Whether to attach hashpass.lat subdomains to an existing Amplify app"
  type        = bool
  default     = false
}

variable "amplify_app_id" {
  description = "Amplify app ID (required when create_amplify_domain_association=true)"
  type        = string
  default     = null
}

variable "amplify_dev_branch" {
  description = "Amplify branch for development frontend"
  type        = string
  default     = "develop"
}

variable "amplify_prod_branch" {
  description = "Amplify branch for production frontend"
  type        = string
  default     = "main"
}

variable "amplify_wait_for_verification" {
  description = "Wait for Amplify domain verification during apply"
  type        = bool
  default     = false
}

<<<<<<< Updated upstream
variable "manage_amplify_branches" {
  description = "Whether Terraform should manage Amplify branches for the frontend app"
  type        = bool
  default     = false
}

variable "amplify_branch_environment_variables" {
  description = "Environment variables keyed by Amplify branch name"
  type        = map(map(string))
  default     = {}
}

=======
>>>>>>> Stashed changes
variable "tags" {
  description = "Tags applied to AWS resources"
  type        = map(string)
  default     = {}
}

variable "aws_region" {
  description = "AWS region for API Gateway and Lambda"
  type        = string
  default     = "us-east-1"
}

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

variable "api_mapping_key" {
  description = "API mapping key exposed on custom domains"
  type        = string
  default     = "api"
}

variable "lambda_zip_path" {
  description = "Path to packaged Lambda ZIP"
  type        = string
  default     = "../../../../../lambda-deployment.zip"
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
      "https://bsl-dev.hashpass.tech",
      "https://bsl.hashpass.tech",
      "https://blockchainsummit-dev.hashpass.lat",
      "https://blockchainsummit.hashpass.lat"
    ]
    prod = [
      "https://hashpass.tech",
      "https://www.hashpass.tech",
      "https://bsl.hashpass.tech",
      "https://bsl-dev.hashpass.tech",
      "https://blockchainsummit.hashpass.lat",
      "https://blockchainsummit-dev.hashpass.lat"
    ]
  }
}

variable "tags" {
  description = "Tags applied to AWS resources"
  type        = map(string)
  default     = {}
}

variable "enable_custom_domain" {
  description = "Whether to create ACM and Route53 custom domains now"
  type        = bool
  default     = false
}

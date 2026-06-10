variable "name_prefix" {
  description = "Prefix used for all resource names"
  type        = string
  default     = "hashpass"
}

variable "environment" {
  description = "Deployment environment name (dev, prod, etc.)"
  type        = string
}

variable "domain_name" {
  description = "Custom API domain name (for example api.hashpass.tech)"
  type        = string
}

variable "route53_zone_id" {
  description = "Route53 hosted zone ID where the domain record should be created"
  type        = string
}

variable "mapping_key" {
  description = "API mapping key to expose the API under a path segment (for example api). Set empty string for root mapping."
  type        = string
  default     = "api"
}

variable "lambda_zip_path" {
  description = "Path to the Lambda deployment ZIP file"
  type        = string
}

variable "lambda_source_code_hash" {
  description = "Optional base64-encoded SHA256 hash of the lambda ZIP"
  type        = string
  default     = null
}

variable "lambda_handler" {
  description = "Lambda handler entrypoint"
  type        = string
  default     = "index.handler"
}

variable "lambda_runtime" {
  description = "Lambda runtime"
  type        = string
  default     = "nodejs22.x"
}

variable "lambda_memory_size" {
  description = "Lambda memory size in MB"
  type        = number
  default     = 1024
}

variable "lambda_timeout" {
  description = "Lambda timeout in seconds"
  type        = number
  default     = 30
}

variable "lambda_architectures" {
  description = "Lambda architecture list"
  type        = list(string)
  default     = ["x86_64"]
}

variable "lambda_environment" {
  description = "Lambda environment variables"
  type        = map(string)
  default     = {}
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 14
}

variable "cors_allow_origins" {
  description = "CORS allow origins for HTTP API"
  type        = list(string)
  default     = ["*"]
}

variable "cors_allow_headers" {
  description = "CORS allow headers for HTTP API"
  type        = list(string)
  default = [
    "Content-Type",
    "Authorization",
    "Cache-Control",
    "Pragma",
    "Expires",
    "X-Client-Version"
  ]
}

variable "cors_allow_methods" {
  description = "CORS allow methods for HTTP API"
  type        = list(string)
  default     = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
}

variable "cors_allow_credentials" {
  description = "Whether to allow credentials in CORS"
  type        = bool
  default     = true
}

variable "tags" {
  description = "Tags applied to all resources"
  type        = map(string)
  default     = {}
}

variable "aws_region" {
  description = "AWS region for API Gateway and Lambda"
  type        = string
  default     = "us-east-1"
}

variable "name_prefix" {
  description = "Prefix used for resource names"
  type        = string
  default     = "hashpass-links"
}

# hashpass.link is not yet confirmed registered, and DNS/ACM for it must not
# be touched without an explicit go-ahead (see packages/hashpass-links-api/README.md).
# This value only matters once enable_custom_domain is flipped to true --
# until then the module skips every ACM/Route53 resource that would read it.
variable "domain_name" {
  description = "Custom domain per environment, only used once enable_custom_domain = true"
  type = object({
    dev  = string
    prod = string
  })
  default = {
    dev  = "links-dev.hashpass.link"
    prod = "hashpass.link"
  }
}

variable "route53_zone_name" {
  description = "Route53 hosted zone name for the custom domain, only looked up once enable_custom_domain = true"
  type        = string
  default     = "hashpass.link"
}

variable "enable_custom_domain" {
  description = "Whether to create ACM, custom domain, and Route53 records for hashpass.link. Stays false until the domain is confirmed registered and DNS cutover is explicitly approved."
  type        = bool
  default     = false
}

variable "lambda_zip_path" {
  description = "Path to the packaged Lambda ZIP (see packages/tools/scripts/package-hashpass-links-lambda.sh)"
  type        = string
  default     = "../../../../../hashpass-links-api-lambda.zip"
}

variable "lambda_source_code_hash" {
  description = "Optional base64-encoded SHA256 hash of the lambda ZIP"
  type        = string
  default     = null
}

variable "lambda_handler" {
  description = "Lambda handler entrypoint (esbuild CJS bundle -- see packages/hashpass-links-api/lambda/index.ts)"
  type        = string
  default     = "index.handler"
}

variable "lambda_runtime" {
  description = "Lambda runtime"
  type        = string
  default     = "nodejs20.x"
}

variable "lambda_memory_size" {
  description = "Lambda memory size in MB"
  type        = number
  default     = 512
}

variable "lambda_timeout" {
  description = "Lambda timeout in seconds"
  type        = number
  default     = 15
}

variable "api_throttle_settings" {
  description = "Per-environment API Gateway HTTP stage limits"
  type = object({
    dev = object({
      rate_limit  = number
      burst_limit = number
    })
    prod = object({
      rate_limit  = number
      burst_limit = number
    })
  })
  default = {
    dev = {
      rate_limit  = 20
      burst_limit = 40
    }
    prod = {
      rate_limit  = 50
      burst_limit = 100
    }
  }
}

variable "supabase_urls" {
  description = "Supabase project URL per environment (SUPABASE_URL)"
  type        = map(string)
  default     = {}
}

variable "supabase_service_role_keys" {
  description = "Supabase service-role key per environment (SUPABASE_SERVICE_ROLE_KEY). Treat as sensitive -- pass via a gitignored *.auto.tfvars or CI secret, never commit real values."
  type        = map(string)
  default     = {}
  sensitive   = true
}

variable "cors_allow_origins" {
  description = "Allowed CORS origins by environment -- the browsers allowed to call this API (see packages/hashpass-links-api/src/routes/auth-qr.ts's browser-binding header note)"
  type        = map(list(string))
  default = {
    dev = [
      "http://localhost:3000",
      "https://hashpass.club",
    ]
    prod = [
      "https://hashpass.club",
    ]
  }
}

variable "lambda_environment_overrides" {
  description = "Additional Lambda environment variables by environment"
  type        = map(map(string))
  default     = {}
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 14
}

variable "tags" {
  description = "Tags applied to AWS resources"
  type        = map(string)
  default     = {}
}

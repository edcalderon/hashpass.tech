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

# hashpass.link's Route53 hosted zone is confirmed live and authoritative
# (its registrar NS records match the zone's own NS set) -- unlike hpass.id
# and hashp.link below, it needs no external registrar cutover before this
# flips to true. This value only matters once enable_custom_domain is
# flipped to true -- until then the module skips every ACM/Route53 resource
# that would read it.
variable "domain_name" {
  description = "Custom domain per environment, only used once enable_custom_domain = true"
  type = object({
    dev  = string
    prod = string
  })
  default = {
    dev  = "dev.hashpass.link"
    prod = "hashpass.link"
  }
}

variable "route53_zone_name" {
  description = "Route53 hosted zone name for the custom domain, only looked up once enable_custom_domain = true"
  type        = string
  default     = "hashpass.link"
}

variable "enable_custom_domain" {
  description = "Whether to create ACM, custom domain, and Route53 records for hashpass.link. Requires an explicit go-ahead before flipping (see packages/hashpass-links-api/README.md)."
  type        = bool
  default     = false
}

# hpass.id is the primary short-link/QR domain and hashp.link is a
# defensive alias -- both map onto this SAME prod API (module.links_api_prod)
# via the additive aws_apigatewayv2_extra_domain module rather than their own
# aws_expo_router_api instance, so there is exactly one Lambda/qr_links table
# behind every domain (no per-domain analytics split). No dev counterparts:
# these are prod-only. Both domains are registered at Spaceship and, as of
# this stack's last apply, still on Spaceship's default nameservers -- their
# enable_* flags must stay false until the registrar NS cutover to the
# hashpass-dns stack's zones has propagated (see that stack's name_servers
# output), or aws_acm_certificate_validation will hang on DNS validation.
variable "hpass_id_domain_name" {
  description = "Primary short-link/QR domain, mapped onto the prod links API as an additional custom domain"
  type        = string
  default     = "hpass.id"
}

variable "hpass_id_zone_name" {
  description = "Route53 hosted zone name for hpass.id (created in the hashpass-dns stack)"
  type        = string
  default     = "hpass.id"
}

variable "enable_hpass_id_domain" {
  description = "Whether to wire hpass.id onto the prod links API. Stays false until Spaceship NS delegation for hpass.id has propagated."
  type        = bool
  default     = false
}

variable "hashp_link_domain_name" {
  description = "Optional defensive-alias domain, mapped onto the prod links API as an additional custom domain"
  type        = string
  default     = "hashp.link"
}

variable "hashp_link_zone_name" {
  description = "Route53 hosted zone name for hashp.link (created in the hashpass-dns stack)"
  type        = string
  default     = "hashp.link"
}

variable "enable_hashp_link_domain" {
  description = "Whether to wire hashp.link onto the prod links API. Same NS-cutover caveat as enable_hpass_id_domain."
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
      # club-dev's resolveHashpassAppUrl() opens the approval screen at
      # dev.hashpass.tech -- API Gateway owns OPTIONS, so this must be
      # listed here as well as in the Lambda's own default allowlist.
      "https://dev.hashpass.tech",
    ]
    prod = [
      "https://hashpass.club",
      # The Club's web-app approval link opens at hashpass.tech. API Gateway
      # owns OPTIONS, so this must be listed here as well as in the Lambda.
      "https://hashpass.tech",
      "https://www.hashpass.tech",
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

variable "qr_link_expiry_sweep_schedule" {
  description = "EventBridge schedule that archives QR links whose availability window has ended"
  type        = string
  default     = "rate(5 minutes)"
}

variable "tags" {
  description = "Tags applied to AWS resources"
  type        = map(string)
  default     = {}
}

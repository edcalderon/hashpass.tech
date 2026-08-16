variable "aws_region" {
  description = "AWS region for API Gateway and Lambda"
  type        = string
  default     = "us-east-1"
}

variable "name_prefix" {
  description = "Prefix used for resource names"
  type        = string
  default     = "hashpass-autodiscover"
}

variable "route53_zone_name" {
  description = "Route53 hosted zone name for autodiscover.<this>"
  type        = string
  default     = "hashpass.tech"
}

# Deliberately isolated from stacks/hashpass-api-target -- that stack's
# lambda_environment definitions have drifted far behind the ~40 real env
# vars live on hashpass-prod-expo-router-api (managed out-of-band via
# packages/tools/scripts/deploy-api-lambda.sh, never through Terraform), so
# a bare `terraform apply` there would silently wipe production secrets.
# Confirmed 2026-08-16 -- see the caution note this stack's README/comments
# reference. This stack owns nothing that stack owns.
variable "enable_custom_domain" {
  description = "Whether to create ACM, custom domain, and Route53 records for autodiscover.hashpass.tech. Starts false -- verify the Lambda's raw execute-api output first, since flipping this also requires deleting the existing Hostinger CNAME for the same name before Terraform can create its own record."
  type        = bool
  default     = false
}

variable "lambda_zip_path" {
  description = "Path to the autodiscover Lambda deployment ZIP file"
  type        = string
  default     = "../../../lambda/autodiscover/autodiscover-lambda.zip"
}

variable "lambda_source_code_hash" {
  description = "Optional base64-encoded SHA256 hash of the lambda ZIP, so Terraform detects a rebuilt zip"
  type        = string
  default     = null
}

variable "tags" {
  description = "Common resource tags"
  type        = map(string)
  default = {
    Project = "hashpass"
    Service = "autodiscover-responder"
  }
}

variable "aws_region" {
  description = "Default AWS region for target-account resources (S3/other) in this stack."
  type        = string
  default     = "us-east-2"
}

variable "aws_profile" {
  description = "AWS CLI profile to use (target account). See CLAUDE.md's 'Target AWS Account Access'."
  type        = string
  default     = "hashpass"
}

variable "aws_source_profile" {
  description = <<-EOT
    AWS CLI profile for the SOURCE account (058264267235) -- this is where
    hashpass.tech's real, publicly-delegated Route53 zone actually lives
    (confirmed via `dig NS hashpass.tech`), not the target account. Only
    used for Route53 record writes; see versions.tf's aws.source_dns
    provider. CLAUDE.md's `default` profile already authenticates here.
  EOT
  type        = string
  default     = "default"
}

variable "route53_zone_name" {
  description = "Existing target-account Route53 hosted zone that owns every demo subdomain below."
  type        = string
  default     = "hashpass.tech"
}

variable "repository" {
  description = "GitHub repository in owner/name form, for the demo pipeline's source stage."
  type        = string
  default     = "hashpass-tech/hashpass.tech"
}

variable "connection_arn" {
  description = "AWS CodeConnections ARN for the GitHub source connection (shared with bsl-target/hashpass-web -- see their terraform.tfvars)."
  type        = string
}

# CriptoLatinFest is guarded to the develop DB end-to-end (see the isDemo
# guard in apps/mobile-app/config/supabase-profiles.ts) -- these are the
# *real* bsl-development Supabase project's credentials
# (BSL_SUPABASE_*_DEV in the repo-root .env), not bsl-target's
# terraform.tfvars supabase_url_dev/supabase_key_dev, which actually point
# at the core-development project (a pre-existing mismatch confirmed live on
# bsl-dev.hashpass.tech's deployed bundle -- out of scope to fix here, but
# not something to copy into a new pipeline).
variable "bsl_dev_supabase_url" {
  description = "bsl-development Supabase project URL."
  type        = string
}

variable "bsl_dev_supabase_key" {
  description = "bsl-development Supabase publishable/anon key."
  type        = string
  sensitive   = true
}

variable "bsl_dev_supabase_service_role_key" {
  description = "bsl-development Supabase service-role key (build-time only, not baked into the client bundle -- EXPO_PUBLIC_* is the only prefix Expo inlines client-side)."
  type        = string
  sensitive   = true
}

variable "bsl_dev_supabase_db_url" {
  description = "bsl-development Postgres connection string (build-time only, same reasoning as above)."
  type        = string
  sensitive   = true
}

variable "demo_events" {
  description = <<-EOT
    Map of demo-mode event subdomains to stand up. Each key is a short slug
    used to name resources; `subdomain` is the full hostname to serve.
    Add an entry here (plus the matching packages/config/src/events.ts +
    sso-config.ts + event-detector.ts + supabase-profiles.ts config) for the
    next demo-mode event -- no new module/stack needed.
  EOT
  type = map(object({
    subdomain = string
  }))
  default = {
    criptolatinfest = {
      subdomain = "demo-criptolatinfest.hashpass.tech"
    }
  }
}

variable "tags" {
  description = "Common resource tags."
  type        = map(string)
  default = {
    ManagedBy = "terraform"
    Project   = "hashpass"
    Stack     = "demo-events"
  }
}

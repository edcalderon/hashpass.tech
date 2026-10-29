variable "expected_account_id" {
  description = "Private expected production AWS account ID, passed through TF_VAR_expected_account_id and verified against the hashpass profile."
  type        = string
  sensitive   = true
}

variable "aws_region" {
  description = "AWS region for site buckets and CloudFront origins."
  type        = string
  default     = "us-east-2"
}

variable "route53_zone_name" {
  description = "Public Route 53 zone containing the event hostnames."
  type        = string
  default     = "hashpass.tech"
}

variable "github_repository" {
  description = "GitHub repository allowed to assume event-site publisher roles."
  type        = string
  default     = "hashpass-tech/hashpass.tech"
}

variable "event_sites" {
  description = "Production event sites managed by this isolated stack. Add one map entry per dedicated event hostname."
  type = map(object({
    hostname           = string
    github_environment = string
  }))
  default = {
    cbweek = {
      hostname           = "cbweek.hashpass.tech"
      github_environment = "production"
    }
  }

  validation {
    condition = length(var.event_sites) > 0 && alltrue([
      for key, site in var.event_sites :
      can(regex("^[a-z0-9][a-z0-9-]{0,19}$", key)) &&
      can(regex("^[a-z0-9][a-z0-9-]*\\.hashpass\\.tech$", site.hostname)) &&
      trimspace(site.github_environment) != ""
    ])
    error_message = "event_sites must use short lowercase slugs, one-level hashpass.tech hostnames, and non-empty GitHub environments."
  }
}

variable "tags" {
  description = "Additional tags applied to event production-site resources."
  type        = map(string)
  default     = {}
}

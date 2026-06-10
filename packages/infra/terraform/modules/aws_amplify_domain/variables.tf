variable "app_id" {
  description = "Amplify application ID"
  type        = string
}

variable "domain_name" {
  description = "Root domain associated to Amplify app"
  type        = string
}

variable "wait_for_verification" {
  description = "Whether Terraform should wait for domain verification"
  type        = bool
  default     = false
}

variable "subdomains" {
  description = "Subdomain to branch mappings"
  type = list(object({
    branch_name = string
    prefix      = string
  }))
}

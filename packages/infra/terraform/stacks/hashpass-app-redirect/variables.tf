variable "aws_region" {
  description = "AWS region for the stack's own (non-CloudFront/ACM) resources"
  type        = string
  default     = "us-east-2"
}

variable "app_zone_name" {
  description = "hashpass.app hosted zone name. This zone already exists in the target AWS account (created outside this stack, alongside its live email DNS records -- MX/SPF/DKIM/DMARC for Titan Mail); this stack only reads it via data source and adds web records, it never manages the zone itself."
  type        = string
  default     = "hashpass.app"
}

variable "redirect_domain_names" {
  description = "Hostnames under app_zone_name that should 301-redirect to redirect_target"
  type        = list(string)
  default     = ["hashpass.app", "www.hashpass.app"]
}

variable "redirect_target" {
  description = "Where redirect_domain_names should point, path and query string preserved"
  type        = string
  default     = "https://hashpass.tech"
}

variable "tags" {
  description = "Tags applied to every resource this stack creates"
  type        = map(string)
  default     = {}
}

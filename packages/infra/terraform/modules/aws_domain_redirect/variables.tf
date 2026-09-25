variable "name_prefix" {
  description = "Prefix used for resource names (bucket, CloudFront function, tags)"
  type        = string
}

variable "domain_names" {
  description = "Hostnames that should 301-redirect to target_origin, e.g. [\"hashpass.app\", \"www.hashpass.app\"]. All must resolve in route53_zone_id (or its subdomains' own delegated zones, none of which apply here)."
  type        = list(string)

  validation {
    condition     = length(var.domain_names) > 0
    error_message = "domain_names must contain at least one hostname."
  }
}

variable "target_origin" {
  description = "Origin the redirect points at, scheme included and no trailing slash, e.g. \"https://hashpass.tech\""
  type        = string

  validation {
    condition     = can(regex("^https://[^/]+$", var.target_origin))
    error_message = "target_origin must look like \"https://host\" with no trailing slash or path."
  }
}

variable "target_path_prefix" {
  description = "Optional path inserted before the incoming request path, e.g. /documentation. The incoming path and query string are then preserved."
  type        = string
  default     = ""

  validation {
    condition = var.target_path_prefix == "" || (
      startswith(var.target_path_prefix, "/") &&
      !can(regex("[?#]", var.target_path_prefix))
    )
    error_message = "target_path_prefix must be empty or an absolute path without query or fragment components."
  }
}

variable "route53_zone_id" {
  description = "Route53 hosted zone id that all domain_names live in -- used for both ACM DNS validation and the alias records"
  type        = string
}

variable "price_class" {
  description = "CloudFront price class for the redirect distribution"
  type        = string
  default     = "PriceClass_100"
}

variable "tags" {
  description = "Tags applied to every resource this module creates"
  type        = map(string)
  default     = {}
}

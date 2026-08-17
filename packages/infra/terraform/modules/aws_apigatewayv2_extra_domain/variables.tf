variable "domain_name" {
  description = "Additional custom domain to map onto an existing API Gateway v2 API (for example hpass.id)"
  type        = string
}

variable "api_id" {
  description = "ID of the existing aws_apigatewayv2_api this domain should route to. This module never creates its own API -- it only attaches one more custom domain onto one that already exists, so multiple domains can front the same Lambda/API without duplicating it."
  type        = string
}

variable "stage_name" {
  description = "Stage of the existing API to map this domain onto"
  type        = string
  default     = "$default"
}

variable "route53_zone_id" {
  description = "Route53 hosted zone ID for domain_name, used for both ACM DNS validation and the alias record"
  type        = string
}

variable "mapping_key" {
  description = "API mapping key to expose the API under a path segment. Set empty string for root mapping."
  type        = string
  default     = ""
}

variable "tags" {
  description = "Tags applied to all resources"
  type        = map(string)
  default     = {}
}

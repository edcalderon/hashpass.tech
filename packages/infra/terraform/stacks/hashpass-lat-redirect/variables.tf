variable "aws_region" {
  description = "AWS region for the stack's own (non-CloudFront/ACM) resources"
  type        = string
  default     = "us-east-2"
}

variable "lat_zone_name" {
  description = "hashpass.lat hosted zone name. The zone already exists in the target AWS account and also holds the blockchainsummit and blockchainsummit-dev CNAMEs; this stack only reads it via data source and adds apex/www records, it never manages the zone or those subdomains."
  type        = string
  default     = "hashpass.lat"
}

variable "redirect_domain_names" {
  description = "Hostnames under lat_zone_name that should 301-redirect to redirect_target"
  type        = list(string)
  default     = ["hashpass.lat", "www.hashpass.lat"]
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

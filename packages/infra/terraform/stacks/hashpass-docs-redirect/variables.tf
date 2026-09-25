variable "aws_region" {
  description = "AWS region for the redirect's S3 origin resources"
  type        = string
  default     = "us-east-2"
}

variable "club_zone_name" {
  description = "Existing public Route 53 zone containing docs.hashpass.club"
  type        = string
  default     = "hashpass.club"
}

variable "redirect_domain_names" {
  description = "Documentation hostnames that permanently redirect to the canonical docs path"
  type        = list(string)
  default     = ["docs.hashpass.club"]
}

variable "tags" {
  description = "Tags applied to every managed redirect resource"
  type        = map(string)
  default     = {}
}

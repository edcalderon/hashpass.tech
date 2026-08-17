variable "aws_region" {
  description = "AWS region where the hosted zones should be created"
  type        = string
  default     = "us-east-2"
}

variable "tech_zone_name" {
  description = "Primary HashPass hosted zone name"
  type        = string
  default     = "hashpass.tech"
}

variable "dev_zone_name" {
  description = "Deprecated. dev.hashpass.tech is now hosted in the parent hashpass.tech zone and no separate target hosted zone is created."
  type        = string
  default     = "dev.hashpass.tech"
}

variable "lat_zone_name" {
  description = "Legacy HashPass LAT hosted zone name"
  type        = string
  default     = "hashpass.lat"
}

variable "club_zone_name" {
  description = "HashPass club hosted zone name"
  type        = string
  default     = "hashpass.club"
}

variable "info_zone_name" {
  description = "HashPass information hosted zone name"
  type        = string
  default     = "hashpass.info"
}

variable "hpass_id_zone_name" {
  description = "Primary short-link/QR hosted zone name for the HashPass Links redirect service"
  type        = string
  default     = "hpass.id"
}

variable "hashp_link_zone_name" {
  description = "Defensive-alias hosted zone name for the HashPass Links redirect service"
  type        = string
  default     = "hashp.link"
}

variable "tags" {
  description = "Tags applied to hosted zones"
  type        = map(string)
  default     = {}
}

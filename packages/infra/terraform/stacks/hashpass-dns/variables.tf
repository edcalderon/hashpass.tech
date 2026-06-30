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
  description = "HashPass development hosted zone name"
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

variable "tags" {
  description = "Tags applied to hosted zones"
  type        = map(string)
  default     = {}
}

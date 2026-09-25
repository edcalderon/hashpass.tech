variable "aws_region" {
  description = "AWS region for the redirect distributions' S3 origin resources"
  type        = string
  default     = "us-east-2"
}

variable "hashpass_zone_name" {
  description = "Existing public Route 53 zone containing the hashpass.tech subdomains"
  type        = string
  default     = "hashpass.tech"
}

variable "hash_poker_room_domain" {
  description = "Short public Hash Poker Room hostname"
  type        = string
  default     = "pkrr.hashpass.tech"
}

variable "pkrr_io_domain" {
  description = "Hashpass-owned PKRR alias that canonicalizes to pkrr.io"
  type        = string
  default     = "pkrr.io.hashpass.tech"
}

variable "tags" {
  description = "Tags applied to every managed redirect resource"
  type        = map(string)
  default     = {}
}

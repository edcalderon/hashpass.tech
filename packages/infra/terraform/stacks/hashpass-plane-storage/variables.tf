variable "aws_region" {
  description = "AWS region for Plane's private object storage."
  type        = string
  default     = "us-east-2"
}

variable "name_prefix" {
  description = "Stable resource-name prefix."
  type        = string
  default     = "hashpass-plane-storage"
}

variable "work_origin" {
  description = "Only browser origin permitted to use Plane presigned uploads."
  type        = string
  default     = "https://work.hashpass.tech"
}

variable "tags" {
  description = "Additional tags applied to Plane storage resources."
  type        = map(string)
  default     = {}
}

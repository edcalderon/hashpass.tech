variable "aws_region" {
  description = "Region for the backup bucket."
  type        = string
  default     = "us-east-2"
}

variable "name_prefix" {
  description = "Bucket name prefix; the account id and region are appended."
  type        = string
  default     = "hashpass-db-backups"
}

variable "transition_to_glacier_ir_days" {
  description = "Days before dumps move to Glacier Instant Retrieval (still readable immediately, cheaper storage)."
  type        = number
  default     = 30
}

variable "noncurrent_version_expiration_days" {
  description = "Days an overwritten or deleted dump version is kept before it is removed."
  type        = number
  default     = 90
}

variable "github_repository" {
  description = "GitHub repository (owner/name) whose main-branch workflows may assume the backup roles."
  type        = string
  default     = "hashpass-tech/hashpass.tech"
}

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
  description = "Days before dumps move to Glacier Instant Retrieval (still readable immediately, cheaper storage). Glacier IR bills a 90-day minimum, so do not set this lower than the longest short-lived tier."
  type        = number
  default     = 90
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

variable "alert_email" {
  description = "Mailbox for backup freshness alerts. The SNS subscription must be confirmed once from the email AWS sends."
  type        = string
  default     = "support@hashpass.tech"
}

variable "core_max_age_hours" {
  description = "Alert when the newest prod/core dump is older than this. The workflow runs every 6 hours."
  type        = number
  default     = 8
}

variable "dev_max_age_hours" {
  description = "Alert when the newest dev/shared dump is older than this. The workflow runs weekly."
  type        = number
  default     = 200
}

variable "min_dump_bytes" {
  description = "Alert when the newest dump is smaller than this. Real dumps are about 1 MB or more."
  type        = number
  default     = 100000
}

variable "replica_region" {
  description = "Region of the replica bucket. Must differ from aws_region."
  type        = string
  default     = "us-west-2"
}

variable "object_lock_days" {
  description = "Default Object Lock retention (GOVERNANCE mode) for new dumps. Must be <= the shortest retention tier."
  type        = number
  default     = 14
}

variable "retention_days" {
  description = "Days a dump is kept, by the `tier` object tag set by db-backup.yml. Untagged objects (manual and final dumps) never expire."
  type        = map(number)
  default = {
    frequent = 14  # every 6-hour core dump
    daily    = 35  # the 00:30 UTC core dump
    monthly  = 365 # the 00:30 UTC dump on the 1st
    dev      = 90  # weekly shared-dev dump
  }
}

variable "replica_core_max_age_hours" {
  description = "Alert when the newest replicated prod/core dump is older than this (replication lag or failure)."
  type        = number
  default     = 12
}

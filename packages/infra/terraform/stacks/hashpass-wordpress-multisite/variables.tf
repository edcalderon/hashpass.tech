variable "expected_account_id" {
  description = "Private AWS_TARGET_ACCOUNT_ID; supply through TF_VAR_expected_account_id after a non-printing identity comparison."
  type        = string
  sensitive   = true
}

variable "aws_region" {
  description = "AWS region hosting the Lightsail instance."
  type        = string
  default     = "us-east-2"

  validation {
    condition     = var.aws_region == "us-east-2"
    error_message = "This stack is currently validated only for us-east-2."
  }
}

variable "availability_zone" {
  description = "Lightsail availability zone."
  type        = string
  default     = "us-east-2a"

  validation {
    condition     = contains(["us-east-2a", "us-east-2b", "us-east-2c"], var.availability_zone)
    error_message = "availability_zone must be a supported us-east-2 Lightsail zone."
  }
}

variable "bundle_id" {
  description = "Lightsail bundle. micro_3_0 is the $7/mo 1-GiB starting tier; use small_3_0 ($12/mo, 2 GiB) if load tests show memory pressure."
  type        = string
  default     = "micro_3_0"

  validation {
    condition     = contains(["micro_3_0", "small_3_0"], var.bundle_id)
    error_message = "Use the validated micro_3_0 or small_3_0 WordPress Multisite bundles."
  }
}

variable "admin_ssh_cidr" {
  description = "Required trusted IPv4 CIDR allowed to SSH for secure pre-TLS setup, e.g. a fixed office IP/32. Never use 0.0.0.0/0."
  type        = string

  validation {
    condition     = can(cidrhost(var.admin_ssh_cidr, 0)) && var.admin_ssh_cidr != "0.0.0.0/0"
    error_message = "admin_ssh_cidr must be a valid restricted IPv4 CIDR, never 0.0.0.0/0."
  }
}

variable "public_web_enabled" {
  description = "Open public HTTP/HTTPS only after TLS is configured and verified for both domains. Keep false during initial provisioning."
  type        = bool
  default     = false
}

variable "enable_dns_records" {
  description = "Create A records in existing Route 53 zones after the owner has created both hosted zones and approved the DNS cutover."
  type        = bool
  default     = false
}

variable "enable_auto_snapshots" {
  description = "Enable a daily Lightsail instance snapshot (snapshot storage is billed separately)."
  type        = bool
  default     = true
}

variable "snapshot_time_utc" {
  description = "UTC hour for the daily automatic Lightsail snapshot."
  type        = string
  default     = "06:00"

  validation {
    condition     = can(regex("^(0[0-9]|1[0-9]|2[0-3]):00$", var.snapshot_time_utc))
    error_message = "snapshot_time_utc must be an hourly UTC time such as 06:00."
  }
}

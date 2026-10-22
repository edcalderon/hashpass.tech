variable "aws_region" {
  description = "AWS region used for the hybrid managed node and workload role."
  type        = string
  default     = "us-east-2"
}

variable "name_prefix" {
  description = "Stable, provider-neutral service identity prefix."
  type        = string
  default     = "hashpass-vps"
}

variable "ssm_activation_expiration_date" {
  description = "UTC expiry for the one-time SSM hybrid activation; AWS permits at most 30 days."
  type        = string
}

variable "roles_anywhere_trust_anchor_certificate_pem" {
  description = "Public CA certificate bundle for the workload trust anchor; never provide a CA private key."
  type        = string
  sensitive   = true
  default     = ""
}

variable "enable_roles_anywhere" {
  description = "Whether to create the optional certificate-bound workload identity. Keep false until its CA and exact resource allowlist are approved."
  type        = bool
  default     = false
}

variable "workload_certificate_common_name" {
  description = "Exact CN in the client certificate permitted to assume the workload role."
  type        = string
  default     = ""
}

variable "workload_secret_arns" {
  description = "Exact Secrets Manager secret ARNs readable by the workload. Wildcards are forbidden."
  type        = list(string)
  default     = []
}

variable "workload_kms_key_arns" {
  description = "Exact KMS key ARNs permitted only for decrypting the configured secrets."
  type        = list(string)
  default     = []
}

variable "workload_s3_bucket_arns" {
  description = "Exact S3 bucket ARNs permitted for list/location operations."
  type        = list(string)
  default     = []
}

variable "workload_s3_object_arns" {
  description = "Exact S3 object-prefix ARNs permitted for read/write operations."
  type        = list(string)
  default     = []
}

variable "roles_anywhere_session_duration_seconds" {
  description = "Short-lived IAM Roles Anywhere session duration."
  type        = number
  default     = 3600

  validation {
    condition     = var.roles_anywhere_session_duration_seconds >= 900 && var.roles_anywhere_session_duration_seconds <= 3600
    error_message = "Roles Anywhere sessions must be between 900 and 3600 seconds."
  }
}

variable "tags" {
  description = "Additional tags applied to access-control resources."
  type        = map(string)
  default     = {}
}

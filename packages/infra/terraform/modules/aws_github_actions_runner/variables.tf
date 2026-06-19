variable "name_prefix" {
  description = "Prefix used for AWS resource names"
  type        = string
}

variable "runner_name_prefix" {
  description = "Prefix used for the GitHub runner name"
  type        = string
}

variable "runner_labels" {
  description = "Custom GitHub runner labels"
  type        = list(string)
  default     = ["hashpass-mobile-release"]
}

variable "github_repository" {
  description = "GitHub repository in owner/name form"
  type        = string
}

variable "github_runner_token_secret_arn" {
  description = "Secrets Manager ARN containing the GitHub PAT used to mint runner registration tokens"
  type        = string
}

variable "aws_region" {
  description = "AWS region for the runner"
  type        = string
}

variable "instance_count" {
  description = "Number of runner instances to provision"
  type        = number
  default     = 1
}

variable "instance_type" {
  description = "EC2 instance type for the runner"
  type        = string
  default     = "t3a.medium"
}

variable "subnet_ids" {
  description = "Subnet IDs where runner instances will launch"
  type        = list(string)
  default     = []
}

variable "associate_public_ip_address" {
  description = "Whether the runner instances receive a public IP"
  type        = bool
  default     = true
}

variable "allowed_ssh_cidrs" {
  description = "Optional CIDR ranges allowed to SSH into the runner instances"
  type        = list(string)
  default     = []
}

variable "root_volume_size_gb" {
  description = "Root EBS volume size in GB"
  type        = number
  default     = 80
}

variable "runner_version" {
  description = "Pinned GitHub Actions runner version; leave null to fetch the latest release at bootstrap"
  type        = string
  default     = null
}

variable "pnpm_version" {
  description = "Pinned pnpm version to install on the runner host"
  type        = string
}

variable "detailed_monitoring" {
  description = "Enable detailed EC2 monitoring"
  type        = bool
  default     = true
}

variable "cpu_alarm_threshold" {
  description = "CPU threshold percentage for the runner alarm"
  type        = number
  default     = 85
}

variable "alarm_actions" {
  description = "Optional SNS topic ARNs invoked when alarms enter ALARM"
  type        = list(string)
  default     = []
}

variable "ok_actions" {
  description = "Optional SNS topic ARNs invoked when alarms recover"
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Tags applied to all runner resources"
  type        = map(string)
  default     = {}
}

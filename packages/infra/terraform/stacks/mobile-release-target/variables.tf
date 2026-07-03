variable "aws_region" {
  description = "AWS region for the mobile release runner"
  type        = string
  default     = "us-east-1"
}

variable "name_prefix" {
  description = "Prefix used for AWS resource names"
  type        = string
  default     = "hashpass-mobile-release-target"
}

variable "github_repository" {
  description = "GitHub repository in owner/name form"
  type        = string
  default     = "hashpass-tech/hashpass.tech"
}

variable "runner_name_prefix" {
  description = "Prefix used for the GitHub runner name"
  type        = string
  default     = "hashpass-mobile-release-target"
}

variable "runner_labels" {
  description = "Custom GitHub runner labels"
  type        = list(string)
  default     = ["hashpass-mobile-release-target"]
}

variable "instance_type" {
  description = "EC2 instance type. t3a.large (8 GiB) handles incremental builds; upgrade to t3a.xlarge (16 GiB) if NDK recompilation OOMs."
  type        = string
  default     = "t3a.large"
}

variable "instance_count" {
  description = "Number of runner instances to provision"
  type        = number
  default     = 1
}

variable "subnet_ids" {
  description = "Subnet IDs where the runner instances will launch. Leave empty to let the stack create managed public subnets."
  type        = list(string)
  default     = []
}

variable "vpc_cidr_block" {
  description = "CIDR block for the managed runner VPC when subnet_ids is empty"
  type        = string
  default     = "10.40.0.0/16"
}

variable "public_subnet_cidr_blocks" {
  description = "CIDR blocks for the managed public subnets when subnet_ids is empty"
  type        = list(string)
  default     = ["10.40.1.0/24"]
}

variable "associate_public_ip_address" {
  description = "Whether the runner instances receive a public IP"
  type        = bool
  default     = true
}

variable "allowed_ssh_cidrs" {
  description = "Optional SSH ingress CIDRs for emergency access"
  type        = list(string)
  default     = []
}

variable "root_volume_size_gb" {
  description = "Root EBS volume size in GB. 80 GB covers Android SDK + Gradle cache + NDK outputs + pnpm store."
  type        = number
  default     = 80
}

variable "runner_version" {
  description = "Pinned GitHub Actions runner version; null fetches the latest release during bootstrap"
  type        = string
  default     = null
}

variable "detailed_monitoring" {
  description = "Enable EC2 detailed monitoring (adds ~$3.50/month per instance)"
  type        = bool
  default     = false
}

variable "cpu_alarm_threshold" {
  description = "CPU alarm threshold"
  type        = number
  default     = 85
}

variable "alarm_actions" {
  description = "Optional SNS topic ARNs that receive alarm notifications"
  type        = list(string)
  default     = []
}

variable "ok_actions" {
  description = "Optional SNS topic ARNs that receive alarm recovery notifications"
  type        = list(string)
  default     = []
}

variable "github_runner_token_secret_name" {
  description = "Name for the GitHub runner token secret"
  type        = string
  default     = "hashpass/mobile-release/github-runner-token"
}

variable "tags" {
  description = "Tags applied to runner resources"
  type        = map(string)
  default = {
    Project = "hashpass"
    Owner   = "platform"
  }
}

# ── GitHub Actions auto-start (OIDC) ──────────────────────────────────────────

variable "enable_github_actions_runner_control" {
  description = "Create an IAM OIDC role so GitHub Actions workflows can start/stop the EC2 runner automatically. After enabling, run terraform apply and add the output role ARN as GitHub variable AWS_RUNNER_ROLE_ARN."
  type        = bool
  default     = false
}

variable "create_github_oidc_provider" {
  description = "Create the GitHub Actions OIDC identity provider. Set to false if it already exists in this AWS account (only one is allowed per account)."
  type        = bool
  default     = true
}

variable "github_actions_role_name" {
  description = "Name of the IAM role GitHub Actions assumes to start/stop the EC2 runner"
  type        = string
  default     = "hashpass-mobile-release-target-github-actions"
}

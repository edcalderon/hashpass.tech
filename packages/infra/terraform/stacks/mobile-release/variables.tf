variable "aws_region" {
  description = "AWS region for the mobile release runner"
  type        = string
  default     = "us-east-1"
}

variable "name_prefix" {
  description = "Prefix used for AWS resource names"
  type        = string
  default     = "hashpass-mobile-release"
}

variable "github_repository" {
  description = "GitHub repository in owner/name form"
  type        = string
  default     = "hashpass-tech/hashpass.tech"
}

variable "runner_name_prefix" {
  description = "Prefix used for the GitHub runner name"
  type        = string
  default     = "hashpass-mobile-release"
}

variable "runner_labels" {
  description = "Custom GitHub runner labels"
  type        = list(string)
  default     = ["hashpass-mobile-release"]
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "t3.large"
}

variable "instance_count" {
  description = "Number of runner instances to provision"
  type        = number
  default     = 1
}

variable "subnet_ids" {
  description = "Subnet IDs where the runner instances will launch. Leave empty to use the default VPC subnets."
  type        = list(string)
  default     = []
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
  description = "Root EBS volume size in GB"
  type        = number
  default     = 150
}

variable "runner_version" {
  description = "Pinned GitHub Actions runner version; null fetches the latest release during bootstrap"
  type        = string
  default     = null
}

variable "detailed_monitoring" {
  description = "Enable EC2 detailed monitoring"
  type        = bool
  default     = true
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

variable "create_github_runner_token_secret" {
  description = "Whether Terraform should create the Secrets Manager secret container for the GitHub runner PAT"
  type        = bool
  default     = true
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

variable "aws_region" {
  description = "AWS region containing the Hashpass SSM hybrid managed node"
  type        = string
  default     = "us-east-2"
}

variable "ssm_managed_instance_id" {
  description = "Private SSM hybrid managed-node ID targeted by the deployment workflow"
  type        = string
  sensitive   = true

  validation {
    condition     = can(regex("^mi-[0-9A-Za-z]{8,64}$", var.ssm_managed_instance_id))
    error_message = "ssm_managed_instance_id must be an SSM hybrid managed-node ID."
  }
}

variable "github_repository" {
  description = "GitHub owner/repository allowed to assume the deployment role"
  type        = string
  default     = "hashpass-tech/hashpass.tech"
}

variable "github_environment" {
  description = "GitHub environment allowed to assume the deployment role"
  type        = string
  default     = "production"
}

variable "role_name" {
  description = "Name of the dedicated GitHub Actions VPS deployment role"
  type        = string
  default     = "hashpass-self-hosted-vps-github-deploy"
}

variable "tags" {
  description = "Additional tags applied to the deployment role"
  type        = map(string)
  default     = {}
}

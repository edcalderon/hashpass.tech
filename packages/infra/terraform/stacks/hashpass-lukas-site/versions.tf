terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}
provider "aws" {
  profile             = "hashpass"
  region              = "us-east-2"
  allowed_account_ids = [var.expected_account_id]
}
provider "aws" {
  alias               = "use1"
  profile             = "hashpass"
  region              = "us-east-1"
  allowed_account_ids = [var.expected_account_id]
}
variable "expected_account_id" {
  description = "Private AWS_TARGET_ACCOUNT_ID; supplied through TF_VAR_expected_account_id."
  type        = string
  sensitive   = true
}

variable "github_repository" {
  description = "GitHub repository allowed to assume the Lukas deployment role."
  type        = string
  default     = "hashpass-tech/hashpass.tech"
}

variable "github_environment" {
  description = "GitHub environment bound to the Lukas deployment role."
  type        = string
  default     = "production"
}

variable "github_actions_role_name" {
  description = "Dedicated IAM role name for the Lukas GitHub Actions publisher."
  type        = string
  default     = "hashpass-lukas-site-github-actions"
}

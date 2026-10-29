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
  region              = var.aws_region
  allowed_account_ids = [var.expected_account_id]
}

provider "aws" {
  alias               = "use1"
  profile             = "hashpass"
  region              = "us-east-1"
  allowed_account_ids = [var.expected_account_id]
}

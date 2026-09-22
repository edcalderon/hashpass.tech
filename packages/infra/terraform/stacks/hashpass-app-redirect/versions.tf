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
  region = var.aws_region
}

# CloudFront certificates must be requested in us-east-1 regardless of the
# stack's own working region -- see hashpass-web's dev_site cert for the
# same pattern.
provider "aws" {
  alias  = "use1"
  region = "us-east-1"
}

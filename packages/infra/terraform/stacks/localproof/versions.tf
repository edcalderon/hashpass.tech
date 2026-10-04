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
  region  = var.aws_region
  profile = var.aws_profile
}

# CloudFront/ACM viewer certificates must be requested in us-east-1
# regardless of where the distribution's other resources live.
provider "aws" {
  alias   = "use1"
  region  = "us-east-1"
  profile = var.aws_profile
}

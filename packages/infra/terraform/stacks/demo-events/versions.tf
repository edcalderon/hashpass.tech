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

# hashpass.tech's real public NS delegation (confirmed via `dig NS
# hashpass.tech @8.8.8.8`) points at a hosted zone in the SOURCE account
# (058264267235, zone Z0236404TWGQH7K9IU6F), not the target-account zone
# the hashpass-dns stack manages -- that target-account zone exists but is
# an orphan, not actually delegated at the registrar. Confirmed the hard way:
# the first apply of this stack wrote its ACM DNS validation record into the
# target zone and it sat in PENDING_VALIDATION indefinitely because the
# internet can't see that zone. All Route53 record writes in this stack use
# this provider instead; ACM cert/CloudFront distribution stay in the target
# account (aws.use1 / default provider above) since those aren't DNS.
provider "aws" {
  alias   = "source_dns"
  region  = "us-east-1"
  profile = var.aws_source_profile
}

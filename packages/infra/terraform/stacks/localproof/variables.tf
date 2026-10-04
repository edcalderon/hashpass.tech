variable "aws_region" {
  description = "Default AWS region for target-account resources (S3/other) in this stack."
  type        = string
  default     = "us-east-2"
}

variable "aws_profile" {
  description = "AWS CLI profile to use (target account). See CLAUDE.md's 'Target AWS Account Access'."
  type        = string
  default     = "hashpass"
}

variable "domain_name" {
  description = <<-EOT
    Apex domain served by this stack. Its Route53 hosted zone must already
    exist (see data.aws_route53_zone.this in main.tf) -- this stack only
    adds records to that zone, it does not create or own it (unlike
    hashpass-dns, which owns zone creation for the other HashPass domains).
  EOT
  type    = string
  default = "localproof.org"
}

variable "enable_custom_domain" {
  description = <<-EOT
    Gates everything that requires the ACM certificate to have finished DNS
    validation: the CloudFront distribution's aliases/viewer certificate and
    the apex/www Route53 alias records. ACM can only validate once the
    registrar has delegated the domain to this zone's name servers (see the
    name_servers output) -- a manual, external step this stack cannot
    perform or wait on.

    Leave this false for the first apply: it still requests the ACM
    certificate and writes its DNS validation records into the zone (so
    validation can succeed in the background the moment the registrar
    cutover propagates), and it stands up the S3 bucket + CloudFront
    distribution on CloudFront's default certificate with no aliases, which
    is immediately reachable at the distribution's own *.cloudfront.net
    domain with no DNS dependency at all. Flip it to true and re-apply once
    `aws acm describe-certificate --certificate-arn <acm_certificate_arn
    output> --region us-east-1` reports status ISSUED.
  EOT
  type    = bool
  default = false
}

variable "tags" {
  description = "Common resource tags."
  type        = map(string)
  default = {
    ManagedBy = "terraform"
    Project   = "hashpass"
    Stack     = "localproof"
    App       = "localpass"
  }
}

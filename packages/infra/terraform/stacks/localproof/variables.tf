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

variable "apex_target" {
  description = <<-EOT
    What serves the apex (var.domain_name) and its www subdomain.

    - "cloudfront" (default): this stack's original and current live state --
      the CloudFront distribution's aliases cover both the apex and www, and
      the apex/www Route53 records alias straight to it. Picking this is a
      no-op against today's deployed infrastructure.
    - "github_pages": moves apex + www to GitHub Pages (A/AAAA records at
      GitHub's documented Pages IPs, www as a CNAME to
      github_pages_cname_target) so they can serve
      hashpass-tech/localproof.org's own hand-authored static marketing/docs
      site instead. This stack's CloudFront distribution keeps existing --
      it narrows to app_subdomain_name and keeps serving apps/localpass's
      actual PWA build there, so AWS stays scoped to the app/API role per
      CLAUDE.md's Target AWS Account Access guidance instead of fighting
      GitHub Pages for the same hostname. Switching this re-requests the ACM
      certificate for the new domain (create_before_destroy avoids a gap)
      and rewrites the apex/www records; it does not touch the S3
      bucket/CloudFront distribution identity.
  EOT
  type    = string
  default = "cloudfront"

  validation {
    condition     = contains(["cloudfront", "github_pages"], var.apex_target)
    error_message = "apex_target must be cloudfront or github_pages."
  }
}

variable "app_subdomain_name" {
  description = "Subdomain that keeps serving apps/localpass's PWA build via this stack's CloudFront distribution once apex_target = \"github_pages\" frees the apex for the marketing/docs site. Unused when apex_target = \"cloudfront\"."
  type        = string
  default     = "app.localproof.org"
}

variable "github_pages_apex_ipv4" {
  description = "GitHub Pages' documented apex A records. Only used when apex_target = \"github_pages\". See https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site"
  type        = list(string)
  default = [
    "185.199.108.153",
    "185.199.109.153",
    "185.199.110.153",
    "185.199.111.153",
  ]
}

variable "github_pages_apex_ipv6" {
  description = "GitHub Pages' documented apex AAAA records. Only used when apex_target = \"github_pages\"."
  type        = list(string)
  default = [
    "2606:50c0:8000::153",
    "2606:50c0:8001::153",
    "2606:50c0:8002::153",
    "2606:50c0:8003::153",
  ]
}

variable "github_pages_cname_target" {
  description = "Hostname the www subdomain CNAMEs to when apex_target = \"github_pages\". hashpass-tech/localproof.org resolves under hashpass-tech.github.io because Pages is served from the GitHub org account, not a personal one."
  type        = string
  default     = "hashpass-tech.github.io"
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

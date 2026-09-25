locals {
  common_tags = merge(var.tags, {
    ManagedBy = "terraform"
    Project   = "hashpass-docs-redirect"
  })
}

# This is deliberately a data source: the existing public zone also carries
# unrelated records. This stack may create only the docs subdomain's web
# records and certificate-validation record.
data "aws_route53_zone" "club" {
  name         = "${trim(var.club_zone_name, ".")}."
  private_zone = false
}

module "docs_redirect" {
  source = "../../modules/aws_domain_redirect"
  providers = {
    aws      = aws
    aws.use1 = aws.use1
  }

  name_prefix        = "hashpass-docs-redirect"
  domain_names       = var.redirect_domain_names
  target_origin      = "https://hashpass.club"
  target_path_prefix = "/documentation"
  route53_zone_id    = data.aws_route53_zone.club.zone_id

  tags = local.common_tags
}

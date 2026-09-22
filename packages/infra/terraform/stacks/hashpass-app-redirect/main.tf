locals {
  common_tags = merge(var.tags, {
    ManagedBy = "terraform"
    Project   = "hashpass-app-redirect"
  })
}

# Read-only: this zone (and its email records) already exists in the
# account. Deliberately a data source, not aws_route53_zone here, so this
# stack can never touch the MX/SPF/DKIM/DMARC records that live in it.
data "aws_route53_zone" "app" {
  name         = "${trim(var.app_zone_name, ".")}."
  private_zone = false
}

module "app_redirect" {
  source = "../../modules/aws_domain_redirect"
  providers = {
    aws      = aws
    aws.use1 = aws.use1
  }

  name_prefix     = "hashpass-app-redirect"
  domain_names    = var.redirect_domain_names
  target_origin   = var.redirect_target
  route53_zone_id = data.aws_route53_zone.app.zone_id

  tags = local.common_tags
}

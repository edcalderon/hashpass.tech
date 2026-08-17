locals {
  common_tags = merge(var.tags, {
    ManagedBy = "terraform"
    Project   = "hashpass"
    Stack     = "hashpass-dns"
  })
}

resource "aws_route53_zone" "tech" {
  name    = trim(var.tech_zone_name, ".")
  comment = "HashPass target hosted zone for ${trim(var.tech_zone_name, ".")}"
  tags    = merge(local.common_tags, { Domain = trim(var.tech_zone_name, ".") })
}

resource "aws_route53_zone" "lat" {
  name    = trim(var.lat_zone_name, ".")
  comment = "HashPass target hosted zone for ${trim(var.lat_zone_name, ".")}"
  tags    = merge(local.common_tags, { Domain = trim(var.lat_zone_name, ".") })
}

resource "aws_route53_zone" "club" {
  name    = trim(var.club_zone_name, ".")
  comment = "HashPass target hosted zone for ${trim(var.club_zone_name, ".")}"
  tags    = merge(local.common_tags, { Domain = trim(var.club_zone_name, ".") })
}

resource "aws_route53_zone" "info" {
  name    = trim(var.info_zone_name, ".")
  comment = "HashPass target hosted zone for ${trim(var.info_zone_name, ".")}"
  tags    = merge(local.common_tags, { Domain = trim(var.info_zone_name, ".") })
}

# hpass.id and hashp.link back the multi-domain QR/short-link redirect
# (see packages/infra/terraform/stacks/hashpass-links-api) -- both are
# registered at Spaceship and, as of this stack's last apply, still on
# Spaceship's default launch1/launch2.spaceship.net nameservers. Creating
# these zones has no external effect until their NS records are updated at
# the registrar to the 4 values in this stack's name_servers output; that
# cutover is manual and happens outside Terraform.
resource "aws_route53_zone" "hpass_id" {
  name    = trim(var.hpass_id_zone_name, ".")
  comment = "HashPass target hosted zone for ${trim(var.hpass_id_zone_name, ".")}"
  tags    = merge(local.common_tags, { Domain = trim(var.hpass_id_zone_name, ".") })
}

resource "aws_route53_zone" "hashp_link" {
  name    = trim(var.hashp_link_zone_name, ".")
  comment = "HashPass target hosted zone for ${trim(var.hashp_link_zone_name, ".")}"
  tags    = merge(local.common_tags, { Domain = trim(var.hashp_link_zone_name, ".") })
}

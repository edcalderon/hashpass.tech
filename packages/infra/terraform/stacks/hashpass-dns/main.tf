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

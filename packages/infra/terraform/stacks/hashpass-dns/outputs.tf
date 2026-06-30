output "zone_ids" {
  description = "Hosted zone IDs created in the target account"
  value = {
    tech = aws_route53_zone.tech.zone_id
    dev  = aws_route53_zone.dev.zone_id
    lat  = aws_route53_zone.lat.zone_id
    club = aws_route53_zone.club.zone_id
  }
}

output "name_servers" {
  description = "Nameserver delegation targets for the hosted zones"
  value = {
    tech = aws_route53_zone.tech.name_servers
    dev  = aws_route53_zone.dev.name_servers
    lat  = aws_route53_zone.lat.name_servers
    club = aws_route53_zone.club.name_servers
  }
}

output "hosted_zones" {
  description = "Hosted zone names"
  value = {
    tech = aws_route53_zone.tech.name
    dev  = aws_route53_zone.dev.name
    lat  = aws_route53_zone.lat.name
    club = aws_route53_zone.club.name
  }
}

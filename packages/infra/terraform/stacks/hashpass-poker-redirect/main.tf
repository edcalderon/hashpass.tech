locals {
  common_tags = merge(var.tags, {
    ManagedBy = "terraform"
    Project   = "hashpass-poker-redirect"
  })
}

# The existing public zone contains unrelated application records. This stack
# manages only the two requested HTTPS redirect hostnames and their ACM
# validation records.
data "aws_route53_zone" "hashpass" {
  name         = "${trim(var.hashpass_zone_name, ".")}."
  private_zone = false
}

module "hash_poker_room" {
  source = "../../modules/aws_domain_redirect"
  providers = {
    aws      = aws
    aws.use1 = aws.use1
  }

  name_prefix        = "hashpass-pkrr-redirect"
  domain_names       = [var.hash_poker_room_domain]
  target_origin      = "https://hashpass.tech"
  target_path_prefix = "/events/hash-poker/event-info"
  route53_zone_id    = data.aws_route53_zone.hashpass.zone_id

  tags = local.common_tags
}

module "pkrr_io" {
  source = "../../modules/aws_domain_redirect"
  providers = {
    aws      = aws
    aws.use1 = aws.use1
  }

  name_prefix     = "hashpass-pkrr-io-redirect"
  domain_names    = [var.pkrr_io_domain]
  target_origin   = "https://pkrr.io"
  route53_zone_id = data.aws_route53_zone.hashpass.zone_id

  tags = local.common_tags
}

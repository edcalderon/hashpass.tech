# Route the original printed QR hostname through the tracking service.
# A DNS CNAME to Club alone would neither supply HTTPS for this hostname
# nor record visits. This reuses the existing API and Lambda.
variable "enable_invite_domain" {
  description = "Attach invite.hashpass.app after the invite migration and Lambda handler are deployed"
  type        = bool
  default     = false
}

data "aws_route53_zone" "invite" {
  count        = var.enable_invite_domain ? 1 : 0
  name         = "hashpass.app."
  private_zone = false
}

module "links_extra_domain_invite" {
  count  = var.enable_invite_domain ? 1 : 0
  source = "../../modules/aws_apigatewayv2_extra_domain"

  domain_name     = "invite.hashpass.app"
  api_id          = module.links_api_prod.api_id
  stage_name      = "$default"
  route53_zone_id = data.aws_route53_zone.invite[0].zone_id
  mapping_key     = ""

  tags = merge(local.common_tags, { Environment = "prod" })
}

locals {
  instance_name = "hashpass-editorial-wordpress"

  tags = {
    Project     = "hashpass"
    ManagedBy   = "terraform"
    Stack       = "hashpass-wordpress-multisite"
    Environment = "production"
  }

  ingress_rules = concat(
    [{
      protocol  = "tcp"
      from_port = 22
      to_port   = 22
      cidrs     = [var.admin_ssh_cidr]
    }],
    var.public_web_enabled ? [
      {
        protocol  = "tcp"
        from_port = 80
        to_port   = 80
        cidrs     = ["0.0.0.0/0"]
      },
      {
        protocol  = "tcp"
        from_port = 443
        to_port   = 443
        cidrs     = ["0.0.0.0/0"]
      }
    ] : []
  )
}

resource "aws_lightsail_instance" "wordpress" {
  name              = local.instance_name
  availability_zone = var.availability_zone
  blueprint_id      = "wordpress_multisite_ls_1_0"
  bundle_id         = var.bundle_id
  ip_address_type   = "ipv4"

  dynamic "add_on" {
    for_each = var.enable_auto_snapshots ? [1] : []
    content {
      type          = "AutoSnapshot"
      snapshot_time = var.snapshot_time_utc
      status        = "Enabled"
    }
  }

  tags = local.tags

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_lightsail_static_ip" "wordpress" {
  name = "hashpass-editorial-wordpress-ip"
}

resource "aws_lightsail_static_ip_attachment" "wordpress" {
  static_ip_name = aws_lightsail_static_ip.wordpress.name
  instance_name  = aws_lightsail_instance.wordpress.name
}

resource "aws_lightsail_instance_public_ports" "wordpress" {
  instance_name = aws_lightsail_instance.wordpress.name

  dynamic "port_info" {
    for_each = local.ingress_rules
    content {
      protocol  = port_info.value.protocol
      from_port = port_info.value.from_port
      to_port   = port_info.value.to_port
      cidrs     = port_info.value.cidrs
    }
  }
}

data "aws_route53_zone" "blog" {
  count        = var.enable_dns_records ? 1 : 0
  name         = "hashpass.blog."
  private_zone = false
}

data "aws_route53_zone" "news" {
  count        = var.enable_dns_records ? 1 : 0
  name         = "hashpass.news."
  private_zone = false
}

resource "aws_route53_record" "blog" {
  count   = var.enable_dns_records ? 1 : 0
  zone_id = data.aws_route53_zone.blog[0].zone_id
  name    = "hashpass.blog"
  type    = "A"
  ttl     = 300
  records = [aws_lightsail_static_ip.wordpress.ip_address]
}

resource "aws_route53_record" "news" {
  count   = var.enable_dns_records ? 1 : 0
  zone_id = data.aws_route53_zone.news[0].zone_id
  name    = "hashpass.news"
  type    = "A"
  ttl     = 300
  records = [aws_lightsail_static_ip.wordpress.ip_address]
}

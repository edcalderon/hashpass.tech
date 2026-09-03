# Retire the prior buckets from Terraform state without deleting their
# populated contents. The CBWeek pipeline creates and manages its own named
# buckets; emptying and deleting the legacy pair is an explicit follow-up.
removed {
  from = module.criptolatinfest_pipeline.aws_s3_bucket.site

  lifecycle {
    destroy = false
  }
}

removed {
  from = module.criptolatinfest_pipeline.aws_s3_bucket.artifacts

  lifecycle {
    destroy = false
  }
}

moved {
  from = aws_acm_certificate.demo["criptolatinfest"]
  to   = aws_acm_certificate.demo["cbweek2026"]
}

moved {
  from = aws_route53_record.demo_cert_validation["criptolatinfest"]
  to   = aws_route53_record.demo_cert_validation["cbweek2026"]
}

moved {
  from = aws_acm_certificate_validation.demo["criptolatinfest"]
  to   = aws_acm_certificate_validation.demo["cbweek2026"]
}

moved {
  from = aws_cloudfront_distribution.demo["criptolatinfest"]
  to   = aws_cloudfront_distribution.demo["cbweek2026"]
}

moved {
  from = aws_route53_record.demo["criptolatinfest"]
  to   = aws_route53_record.demo["cbweek2026"]
}

moved {
  from = aws_route53_record.demo_ipv6["criptolatinfest"]
  to   = aws_route53_record.demo_ipv6["cbweek2026"]
}

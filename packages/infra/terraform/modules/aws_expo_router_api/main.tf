locals {
  lambda_function_name = "${var.name_prefix}-${var.environment}-expo-router-api"
  api_name             = "${var.name_prefix}-${var.environment}-http-api"
  mapping_key          = trimspace(var.mapping_key) == "" ? null : trimspace(var.mapping_key)
  cert_validation      = one(aws_acm_certificate.api_domain.domain_validation_options)
  tags = merge(var.tags, {
    Environment = var.environment
    ManagedBy   = "terraform"
    Service     = "expo-router-api"
  })
}

data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "${local.lambda_function_name}-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
  tags               = local.tags
}

resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${local.lambda_function_name}"
  retention_in_days = var.log_retention_days
  tags              = local.tags
}

resource "aws_lambda_function" "api_router" {
  function_name    = local.lambda_function_name
  filename         = var.lambda_zip_path
  source_code_hash = var.lambda_source_code_hash
  role             = aws_iam_role.lambda.arn
  handler          = var.lambda_handler
  runtime          = var.lambda_runtime
  timeout          = var.lambda_timeout
  memory_size      = var.lambda_memory_size
  architectures    = var.lambda_architectures
  publish          = true

  environment {
    variables = merge(
      {
        NODE_ENV = var.environment
      },
      var.lambda_environment
    )
  }

  tags = local.tags

  depends_on = [
    aws_iam_role_policy_attachment.lambda_basic_execution,
    aws_cloudwatch_log_group.lambda
  ]
}

resource "aws_apigatewayv2_api" "http_api" {
  name          = local.api_name
  protocol_type = "HTTP"

  cors_configuration {
    allow_credentials = var.cors_allow_credentials
    allow_headers     = var.cors_allow_headers
    allow_methods     = var.cors_allow_methods
    allow_origins     = var.cors_allow_origins
    expose_headers    = ["set-cookie"]
    max_age           = 86400
  }

  tags = local.tags
}

resource "aws_apigatewayv2_integration" "lambda_proxy" {
  api_id                 = aws_apigatewayv2_api.http_api.id
  integration_type       = "AWS_PROXY"
  integration_method     = "POST"
  integration_uri        = aws_lambda_function.api_router.invoke_arn
  payload_format_version = "2.0"
  timeout_milliseconds   = 29000
}

resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.http_api.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.lambda_proxy.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.http_api.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    detailed_metrics_enabled = true
    throttling_burst_limit   = 5000
    throttling_rate_limit    = 10000
  }

  tags = local.tags
}

resource "aws_lambda_permission" "allow_api_gateway" {
  statement_id  = "AllowExecutionFromAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api_router.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.http_api.execution_arn}/*/*"
}

resource "aws_acm_certificate" "api_domain" {
  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = local.tags
}

resource "aws_route53_record" "cert_validation" {
  allow_overwrite = true
  zone_id = var.route53_zone_id
  name    = local.cert_validation.resource_record_name
  type    = local.cert_validation.resource_record_type
  records = [local.cert_validation.resource_record_value]
  ttl     = 60
}

resource "aws_acm_certificate_validation" "api_domain" {
  certificate_arn         = aws_acm_certificate.api_domain.arn
  validation_record_fqdns = [aws_route53_record.cert_validation.fqdn]
}

resource "aws_apigatewayv2_domain_name" "api" {
  domain_name = var.domain_name

  domain_name_configuration {
    certificate_arn = aws_acm_certificate_validation.api_domain.certificate_arn
    endpoint_type   = "REGIONAL"
    security_policy = "TLS_1_2"
  }

  tags = local.tags
}

resource "aws_apigatewayv2_api_mapping" "api" {
  api_id          = aws_apigatewayv2_api.http_api.id
  domain_name     = aws_apigatewayv2_domain_name.api.id
  stage           = aws_apigatewayv2_stage.default.id
  api_mapping_key = local.mapping_key
}

resource "aws_route53_record" "api_ipv4" {
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    evaluate_target_health = false
    name                   = aws_apigatewayv2_domain_name.api.domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.api.domain_name_configuration[0].hosted_zone_id
  }
}

resource "aws_route53_record" "api_ipv6" {
  zone_id = var.route53_zone_id
  name    = var.domain_name
  type    = "AAAA"

  alias {
    evaluate_target_health = false
    name                   = aws_apigatewayv2_domain_name.api.domain_name_configuration[0].target_domain_name
    zone_id                = aws_apigatewayv2_domain_name.api.domain_name_configuration[0].hosted_zone_id
  }
}

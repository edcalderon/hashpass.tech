data "aws_caller_identity" "current" {}

data "aws_partition" "current" {}

locals {
  common_tags = merge(var.tags, {
    ManagedBy          = "terraform"
    Project            = "hashpass-notion-archive"
    DataClassification = "confidential"
  })

  parameter_arns = [
    "arn:${data.aws_partition.current.partition}:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${var.notion_token_parameter_name}",
    "arn:${data.aws_partition.current.partition}:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${var.notion_root_page_id_parameter_name}",
  ]
}

resource "aws_s3_bucket" "archive" {
  bucket_prefix = "${var.name_prefix}-"
  tags          = local.common_tags
}

resource "aws_s3_bucket_public_access_block" "archive" {
  bucket                  = aws_s3_bucket.archive.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "archive" {
  bucket = aws_s3_bucket.archive.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "archive" {
  bucket = aws_s3_bucket.archive.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "archive" {
  bucket = aws_s3_bucket.archive.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_dynamodb_table" "registry" {
  name         = "${var.name_prefix}-registry"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "sourceId"
  tags         = local.common_tags

  attribute {
    name = "sourceId"
    type = "S"
  }

  server_side_encryption {
    enabled = true
  }
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
  name               = "${var.name_prefix}-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json
  tags               = local.common_tags
}

data "aws_iam_policy_document" "lambda" {
  statement {
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.lambda.arn}:*"]
  }

  statement {
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.archive.arn}/notion/*"]
  }

  statement {
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem"]
    resources = [aws_dynamodb_table.registry.arn]
  }

  statement {
    actions   = ["ssm:GetParameter"]
    resources = local.parameter_arns
  }
}

resource "aws_iam_role_policy" "lambda" {
  name   = "${var.name_prefix}-archive-write"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.lambda.json
}

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${var.name_prefix}"
  retention_in_days = var.log_retention_days
  tags              = local.common_tags
}

resource "aws_lambda_function" "archive" {
  function_name    = var.name_prefix
  filename         = var.lambda_zip_path
  source_code_hash = filebase64sha256(var.lambda_zip_path)
  role             = aws_iam_role.lambda.arn
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  memory_size      = 512
  timeout          = 300

  environment {
    variables = {
      ARCHIVE_BUCKET_NAME                = aws_s3_bucket.archive.id
      REGISTRY_TABLE_NAME                = aws_dynamodb_table.registry.name
      NOTION_TOKEN_PARAMETER_NAME        = var.notion_token_parameter_name
      NOTION_ROOT_PAGE_ID_PARAMETER_NAME = var.notion_root_page_id_parameter_name
    }
  }

  depends_on = [aws_cloudwatch_log_group.lambda]
  tags       = local.common_tags
}

resource "aws_cloudwatch_event_rule" "archive" {
  count               = var.enable_schedule ? 1 : 0
  name                = "${var.name_prefix}-schedule"
  description         = "Runs the Hashpass-only Notion archive importer"
  schedule_expression = var.schedule_expression
  tags                = local.common_tags
}

resource "aws_cloudwatch_event_target" "archive" {
  count = var.enable_schedule ? 1 : 0
  rule  = aws_cloudwatch_event_rule.archive[0].name
  arn   = aws_lambda_function.archive.arn
}

resource "aws_lambda_permission" "allow_eventbridge" {
  count         = var.enable_schedule ? 1 : 0
  statement_id  = "AllowEventBridgeNotionArchive"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.archive.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.archive[0].arn
}

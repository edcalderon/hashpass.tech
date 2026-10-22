data "aws_partition" "current" {}

locals {
  common_tags = merge(var.tags, {
    ManagedBy          = "terraform"
    Project            = "hashpass-vps-access"
    DataClassification = "confidential"
  })
}

data "aws_iam_policy_document" "ssm_managed_node_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ssm.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ssm_managed_node" {
  name               = "${var.name_prefix}-ssm-managed-node"
  assume_role_policy = data.aws_iam_policy_document.ssm_managed_node_assume_role.json
  tags               = local.common_tags
}

resource "aws_iam_role_policy_attachment" "ssm_managed_node_core" {
  role       = aws_iam_role.ssm_managed_node.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_ssm_activation" "vps" {
  name               = "${var.name_prefix}-hybrid"
  description        = "One-time activation for the Hashpass provider-neutral VPS"
  iam_role           = aws_iam_role.ssm_managed_node.name
  registration_limit = 1
  expiration_date    = var.ssm_activation_expiration_date
}

resource "aws_rolesanywhere_trust_anchor" "workload" {
  count   = var.enable_roles_anywhere ? 1 : 0
  name    = "${var.name_prefix}-workload"
  enabled = true

  source {
    source_data {
      x509_certificate_data = var.roles_anywhere_trust_anchor_certificate_pem
    }
    source_type = "CERTIFICATE_BUNDLE"
  }

  lifecycle {
    precondition {
      condition     = length(trimspace(var.roles_anywhere_trust_anchor_certificate_pem)) > 0
      error_message = "A public trust-anchor certificate is required when IAM Roles Anywhere is enabled."
    }

    precondition {
      condition     = length(trimspace(var.workload_certificate_common_name)) > 0
      error_message = "A workload certificate Common Name is required when IAM Roles Anywhere is enabled."
    }
  }
}

data "aws_iam_policy_document" "workload_assume_role" {
  count = var.enable_roles_anywhere ? 1 : 0

  statement {
    actions = ["sts:AssumeRole", "sts:SetSourceIdentity", "sts:TagSession"]

    principals {
      type        = "Service"
      identifiers = ["rolesanywhere.amazonaws.com"]
    }

    condition {
      test     = "ArnEquals"
      variable = "aws:SourceArn"
      values   = [aws_rolesanywhere_trust_anchor.workload[0].arn]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:PrincipalTag/x509Subject/CN"
      values   = [var.workload_certificate_common_name]
    }
  }
}

resource "aws_iam_role" "workload" {
  count              = var.enable_roles_anywhere ? 1 : 0
  name               = "${var.name_prefix}-workload"
  assume_role_policy = data.aws_iam_policy_document.workload_assume_role[0].json
  tags               = local.common_tags
}

data "aws_iam_policy_document" "workload" {
  count = var.enable_roles_anywhere ? 1 : 0

  statement {
    sid       = "ReadOnlyConfiguredSecrets"
    actions   = ["secretsmanager:DescribeSecret", "secretsmanager:GetSecretValue"]
    resources = var.workload_secret_arns
  }

  statement {
    sid       = "DecryptConfiguredSecretsOnly"
    actions   = ["kms:Decrypt"]
    resources = var.workload_kms_key_arns
  }

  statement {
    sid       = "ListConfiguredBucketsOnly"
    actions   = ["s3:ListBucket", "s3:GetBucketLocation"]
    resources = var.workload_s3_bucket_arns
  }

  statement {
    sid       = "AccessConfiguredObjectsOnly"
    actions   = ["s3:GetObject", "s3:PutObject"]
    resources = var.workload_s3_object_arns
  }
}

resource "aws_iam_role_policy" "workload" {
  count  = var.enable_roles_anywhere ? 1 : 0
  name   = "${var.name_prefix}-workload-least-privilege"
  role   = aws_iam_role.workload[0].id
  policy = data.aws_iam_policy_document.workload[0].json
}

resource "aws_rolesanywhere_profile" "workload" {
  count            = var.enable_roles_anywhere ? 1 : 0
  name             = "${var.name_prefix}-workload"
  enabled          = true
  role_arns        = [aws_iam_role.workload[0].arn]
  duration_seconds = var.roles_anywhere_session_duration_seconds
}

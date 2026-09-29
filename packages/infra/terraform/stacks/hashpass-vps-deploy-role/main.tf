data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

locals {
  common_tags = merge(var.tags, {
    ManagedBy = "terraform"
    Project   = "hashpass"
    Stack     = "hashpass-vps-deploy-role"
  })
}

data "aws_iam_policy_document" "github_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repository}:environment:${var.github_environment}"]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  name                 = var.role_name
  description          = "Deploy Hashpass self-hosted services through one SSM hybrid node"
  assume_role_policy   = data.aws_iam_policy_document.github_assume_role.json
  max_session_duration = 3600
  tags                 = local.common_tags
}

data "aws_iam_policy_document" "github_deploy" {
  statement {
    sid     = "SendDeploymentToManagedNode"
    effect  = "Allow"
    actions = ["ssm:SendCommand"]
    resources = [
      "arn:${data.aws_partition.current.partition}:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:managed-instance/${var.ssm_managed_instance_id}",
      "arn:${data.aws_partition.current.partition}:ssm:${var.aws_region}::document/AWS-RunShellScript",
    ]
  }

  statement {
    sid    = "ObserveDeploymentCommand"
    effect = "Allow"
    actions = [
      "ssm:DescribeInstanceInformation",
      "ssm:GetCommandInvocation",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "github_deploy" {
  name   = "hashpass-self-hosted-vps-deploy"
  role   = aws_iam_role.github_deploy.id
  policy = data.aws_iam_policy_document.github_deploy.json
}

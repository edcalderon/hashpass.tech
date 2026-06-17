data "aws_caller_identity" "current" {}

locals {
  common_tags = merge(var.tags, {
    ManagedBy = "terraform"
    Stack     = "mobile-release"
    Service   = "github-actions-runner"
  })
  root_package_json = jsondecode(file("${path.module}/../../../../../package.json"))
  pnpm_version      = replace(local.root_package_json.packageManager, "pnpm@", "")
  manage_network    = length(var.subnet_ids) == 0
}

data "aws_availability_zones" "available" {
  count = local.manage_network ? 1 : 0

  state = "available"
}

locals {
  runner_subnet_ids = local.manage_network ? aws_subnet.runner_public[*].id : var.subnet_ids
}

data "aws_subnet" "provided" {
  count = local.manage_network ? 0 : 1

  id = var.subnet_ids[0]
}

resource "aws_vpc" "runner" {
  count = local.manage_network ? 1 : 0

  cidr_block           = var.vpc_cidr_block
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = merge(local.common_tags, {
    Name    = "${var.name_prefix}-vpc"
    Service = "mobile-release-runner"
  })
}

resource "aws_internet_gateway" "runner" {
  count = local.manage_network ? 1 : 0

  vpc_id = aws_vpc.runner[0].id

  tags = merge(local.common_tags, {
    Name    = "${var.name_prefix}-igw"
    Service = "mobile-release-runner"
  })
}

resource "aws_subnet" "runner_public" {
  count = local.manage_network ? length(var.public_subnet_cidr_blocks) : 0

  vpc_id                  = aws_vpc.runner[0].id
  cidr_block              = var.public_subnet_cidr_blocks[count.index]
  availability_zone       = data.aws_availability_zones.available[0].names[count.index % length(data.aws_availability_zones.available[0].names)]
  map_public_ip_on_launch = true

  tags = merge(local.common_tags, {
    Name    = "${var.name_prefix}-public-${count.index + 1}"
    Service = "mobile-release-runner"
    Tier    = "public"
  })
}

resource "aws_route_table" "runner_public" {
  count = local.manage_network ? 1 : 0

  vpc_id = aws_vpc.runner[0].id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.runner[0].id
  }

  tags = merge(local.common_tags, {
    Name    = "${var.name_prefix}-public-rt"
    Service = "mobile-release-runner"
  })
}

resource "aws_route_table_association" "runner_public" {
  count = local.manage_network ? length(aws_subnet.runner_public) : 0

  route_table_id = aws_route_table.runner_public[0].id
  subnet_id      = aws_subnet.runner_public[count.index].id
}

check "runner_subnets_available" {
  assert {
    condition     = length(local.runner_subnet_ids) > 0
    error_message = "No subnets were found. Provide subnet_ids or let the stack create its managed public subnets."
  }
}

# ── GitHub Actions OIDC — lets the workflow start/stop the EC2 runner ─────────
# Enable with: enable_github_actions_runner_control = true in your tfvars.
# After apply, copy the github_actions_role_arn output as GitHub variable AWS_RUNNER_ROLE_ARN.

resource "aws_iam_openid_connect_provider" "github" {
  count = (var.enable_github_actions_runner_control && var.create_github_oidc_provider) ? 1 : 0

  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fcd",
  ]
  tags = local.common_tags
}

data "aws_iam_openid_connect_provider" "github" {
  count = (var.enable_github_actions_runner_control && !var.create_github_oidc_provider) ? 1 : 0
  url   = "https://token.actions.githubusercontent.com"
}

locals {
  github_oidc_provider_arn = var.enable_github_actions_runner_control ? (
    var.create_github_oidc_provider
      ? aws_iam_openid_connect_provider.github[0].arn
      : data.aws_iam_openid_connect_provider.github[0].arn
  ) : ""
}

data "aws_iam_policy_document" "github_actions_assume_role" {
  count = var.enable_github_actions_runner_control ? 1 : 0

  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.github_oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repository}:*"]
    }
  }
}

resource "aws_iam_role" "github_actions" {
  count = var.enable_github_actions_runner_control ? 1 : 0

  name               = var.github_actions_role_name
  assume_role_policy = data.aws_iam_policy_document.github_actions_assume_role[0].json
  tags               = local.common_tags
}

resource "aws_iam_role_policy" "github_actions_runner_control" {
  count = var.enable_github_actions_runner_control ? 1 : 0

  name = "${var.name_prefix}-runner-control"
  role = aws_iam_role.github_actions[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "StartStopRunner"
        Effect = "Allow"
        Action = ["ec2:StartInstances", "ec2:StopInstances"]
        Resource = [
          for id in module.mobile_release_runner.instance_ids :
          "arn:aws:ec2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:instance/${id}"
        ]
      },
      {
        Sid      = "DescribeRunner"
        Effect   = "Allow"
        Action   = ["ec2:DescribeInstances", "ec2:DescribeInstanceStatus", "ssm:DescribeInstanceInformation"]
        Resource = "*"
      },
    ]
  })
}

resource "aws_secretsmanager_secret" "github_runner_token" {
  name        = var.github_runner_token_secret_name
  description = "GitHub PAT used by the HashPass mobile release runner to mint registration tokens"
  tags        = local.common_tags
}

module "mobile_release_runner" {
  source = "../../modules/aws_github_actions_runner"

  name_prefix                    = var.name_prefix
  runner_name_prefix             = var.runner_name_prefix
  runner_labels                  = var.runner_labels
  github_repository              = var.github_repository
  github_runner_token_secret_arn = aws_secretsmanager_secret.github_runner_token.arn
  aws_region                     = var.aws_region
  instance_count                 = var.instance_count
  instance_type                  = var.instance_type
  subnet_ids                     = local.runner_subnet_ids
  associate_public_ip_address    = var.associate_public_ip_address
  allowed_ssh_cidrs              = var.allowed_ssh_cidrs
  root_volume_size_gb            = var.root_volume_size_gb
  runner_version                 = var.runner_version
  pnpm_version                   = local.pnpm_version
  detailed_monitoring            = var.detailed_monitoring
  cpu_alarm_threshold            = var.cpu_alarm_threshold
  alarm_actions                  = var.alarm_actions
  ok_actions                     = var.ok_actions
  tags                           = local.common_tags
}

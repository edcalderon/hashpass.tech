locals {
  common_tags = merge(var.tags, {
    ManagedBy = "terraform"
    Stack     = "mobile-release"
    Service   = "github-actions-runner"
  })
  root_package_json = jsondecode(file("${path.module}/../../../../../package.json"))
  pnpm_version      = replace(local.root_package_json.packageManager, "pnpm@", "")
}

data "aws_subnets" "default_vpc" {
  count = length(var.subnet_ids) == 0 ? 1 : 0

  filter {
    name   = "default-for-az"
    values = ["true"]
  }
}

locals {
  runner_subnet_ids = length(var.subnet_ids) > 0 ? var.subnet_ids : data.aws_subnets.default_vpc[0].ids
}

check "runner_subnets_available" {
  assert {
    condition     = length(local.runner_subnet_ids) > 0
    error_message = "No subnets were found. Provide subnet_ids or use a default VPC with default subnets."
  }
}

resource "aws_secretsmanager_secret" "github_runner_token" {
  count       = var.create_github_runner_token_secret ? 1 : 0
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
  github_runner_token_secret_arn = var.create_github_runner_token_secret ? aws_secretsmanager_secret.github_runner_token[0].arn : null
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

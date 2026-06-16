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

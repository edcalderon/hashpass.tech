locals {
  subnet_ids        = var.subnet_ids
  runner_labels_csv = join(",", compact(var.runner_labels))
  runner_secret_arn = coalesce(var.github_runner_token_secret_arn, "")
  common_tags = merge(var.tags, {
    ManagedBy = "terraform"
    Project   = "hashpass"
  })
  runner_user_data_raw    = file("${path.module}/templates/runner-user-data.sh.tftpl")
  runner_user_data_step_1 = replace(local.runner_user_data_raw, "__AWS_REGION__", var.aws_region)
  runner_user_data_step_2 = replace(local.runner_user_data_step_1, "__GITHUB_REPOSITORY__", var.github_repository)
  runner_user_data_step_3 = replace(local.runner_user_data_step_2, "__GITHUB_RUNNER_TOKEN_SECRET_ARN__", local.runner_secret_arn)
  runner_user_data_step_4 = replace(local.runner_user_data_step_3, "__PNPM_VERSION__", var.pnpm_version)
  runner_user_data_step_5 = replace(local.runner_user_data_step_4, "__RUNNER_LABELS__", local.runner_labels_csv)
  runner_user_data_step_6 = replace(local.runner_user_data_step_5, "__RUNNER_NAME_PREFIX__", var.runner_name_prefix)
  runner_user_data_step_7 = replace(local.runner_user_data_step_6, "__RUNNER_VERSION__", coalesce(var.runner_version, ""))
  runner_user_data        = replace(local.runner_user_data_step_7, "__NAME_PREFIX__", var.name_prefix)
}

check "runner_subnets_required" {
  assert {
    condition     = length(local.subnet_ids) > 0
    error_message = "At least one subnet_id is required for the GitHub Actions runner module."
  }
}

data "aws_ami" "ubuntu" {
  most_recent = true

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  owners = ["099720109477"]
}

data "aws_vpc" "selected" {
  count   = length(local.subnet_ids) == 0 ? 1 : 0
  default = true
}

data "aws_subnet" "selected" {
  count = length(local.subnet_ids) > 0 ? 1 : 0

  id = local.subnet_ids[0]
}

resource "aws_security_group" "runner" {
  name_prefix = "${var.name_prefix}-runner-"
  description = "Security group for the HashPass GitHub Actions runner"
  vpc_id      = length(local.subnet_ids) > 0 ? data.aws_subnet.selected[0].vpc_id : data.aws_vpc.selected[0].id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port        = 0
    to_port          = 0
    protocol         = "-1"
    ipv6_cidr_blocks = ["::/0"]
  }

  dynamic "ingress" {
    for_each = length(var.allowed_ssh_cidrs) > 0 ? [1] : []

    content {
      description = "Optional SSH access for runner maintenance"
      from_port   = 22
      to_port     = 22
      protocol    = "tcp"
      cidr_blocks = var.allowed_ssh_cidrs
    }
  }

  tags = merge(local.common_tags, {
    Name    = "${var.name_prefix}-runner-sg"
    Service = "mobile-release-runner"
  })
}

data "aws_iam_policy_document" "assume_ec2" {
  statement {
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }

    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role" "runner" {
  name_prefix        = "${var.name_prefix}-runner-"
  assume_role_policy = data.aws_iam_policy_document.assume_ec2.json
  tags               = local.common_tags
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.runner.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

data "aws_iam_policy_document" "secret_access" {
  count = trimspace(local.runner_secret_arn) != "" ? 1 : 0

  statement {
    effect = "Allow"

    actions = [
      "secretsmanager:DescribeSecret",
      "secretsmanager:GetSecretValue",
    ]

    resources = [local.runner_secret_arn]
  }
}

resource "aws_iam_role_policy" "secret_access" {
  count  = trimspace(local.runner_secret_arn) != "" ? 1 : 0
  name   = "${var.name_prefix}-runner-secret-access"
  role   = aws_iam_role.runner.id
  policy = data.aws_iam_policy_document.secret_access[0].json
}

resource "aws_iam_instance_profile" "runner" {
  name_prefix = "${var.name_prefix}-runner-"
  role        = aws_iam_role.runner.name
  tags        = local.common_tags
}

resource "aws_instance" "runner" {
  count = var.instance_count

  ami                         = data.aws_ami.ubuntu.id
  instance_type               = var.instance_type
  subnet_id                   = local.subnet_ids[count.index % length(local.subnet_ids)]
  associate_public_ip_address = var.associate_public_ip_address
  vpc_security_group_ids      = [aws_security_group.runner.id]
  iam_instance_profile        = aws_iam_instance_profile.runner.name
  monitoring                  = var.detailed_monitoring
  user_data_replace_on_change = true
  user_data                   = local.runner_user_data

  metadata_options {
    http_endpoint               = "enabled"
    http_protocol_ipv6          = "enabled"
    http_tokens                 = "required"
    instance_metadata_tags      = "enabled"
    http_put_response_hop_limit = 2
  }

  root_block_device {
    encrypted             = true
    delete_on_termination = true
    volume_type           = "gp3"
    volume_size           = var.root_volume_size_gb
    iops                  = 3000
    throughput            = 125
  }

  tags = merge(local.common_tags, {
    Name       = "${var.runner_name_prefix}-${count.index + 1}"
    Service    = "mobile-release-runner"
    Runner     = var.runner_name_prefix
    Repository = var.github_repository
  })
}

resource "aws_cloudwatch_metric_alarm" "cpu_high" {
  count = var.instance_count

  alarm_name          = "${var.name_prefix}-runner-${count.index + 1}-cpu-high"
  alarm_description   = "CPU utilization for runner instance ${count.index + 1} is above threshold."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 300
  statistic           = "Average"
  threshold           = var.cpu_alarm_threshold
  treat_missing_data  = "missing"

  dimensions = {
    InstanceId = aws_instance.runner[count.index].id
  }

  alarm_actions = var.alarm_actions
  ok_actions    = var.ok_actions

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "status_check_instance" {
  count = var.instance_count

  alarm_name          = "${var.name_prefix}-runner-${count.index + 1}-status-check-instance"
  alarm_description   = "EC2 instance status check failed for runner ${count.index + 1}."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "StatusCheckFailed_Instance"
  namespace           = "AWS/EC2"
  period              = 300
  statistic           = "Maximum"
  threshold           = 0
  treat_missing_data  = "breaching"

  dimensions = {
    InstanceId = aws_instance.runner[count.index].id
  }

  alarm_actions = var.alarm_actions
  ok_actions    = var.ok_actions

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "status_check_system" {
  count = var.instance_count

  alarm_name          = "${var.name_prefix}-runner-${count.index + 1}-status-check-system"
  alarm_description   = "EC2 system status check failed for runner ${count.index + 1}."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "StatusCheckFailed_System"
  namespace           = "AWS/EC2"
  period              = 300
  statistic           = "Maximum"
  threshold           = 0
  treat_missing_data  = "breaching"

  dimensions = {
    InstanceId = aws_instance.runner[count.index].id
  }

  alarm_actions = var.alarm_actions
  ok_actions    = var.ok_actions

  tags = local.common_tags
}

locals {
  dashboard_widgets = [
    for index, instance in aws_instance.runner : {
      type   = "metric"
      x      = 0
      y      = index * 6
      width  = 12
      height = 6
      properties = {
        title  = "${var.runner_name_prefix}-${index + 1}"
        region = var.aws_region
        period = 300
        stat   = "Average"
        view   = "timeSeries"
        metrics = [
          ["AWS/EC2", "CPUUtilization", "InstanceId", instance.id, { "label" = "CPU %" }],
          ["AWS/EC2", "NetworkIn", "InstanceId", instance.id, { "stat" = "Sum", "label" = "Network In" }],
          ["AWS/EC2", "NetworkOut", "InstanceId", instance.id, { "stat" = "Sum", "label" = "Network Out" }],
          ["AWS/EC2", "StatusCheckFailed_Instance", "InstanceId", instance.id, { "stat" = "Maximum", "label" = "Instance Status" }],
          ["AWS/EC2", "StatusCheckFailed_System", "InstanceId", instance.id, { "stat" = "Maximum", "label" = "System Status" }],
        ]
      }
    }
  ]
}

resource "aws_cloudwatch_dashboard" "runner" {
  dashboard_name = "${var.name_prefix}-runner"
  dashboard_body = jsonencode({
    widgets = local.dashboard_widgets
  })
}

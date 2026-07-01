data "aws_caller_identity" "current" {}

locals {
  subnet_ids = var.subnet_ids
  common_tags = merge(var.tags, {
    ManagedBy = "terraform"
    Project   = "hashpass"
  })
  worker_user_data_raw    = file("${path.module}/templates/build-worker-user-data.sh.tftpl")
  worker_user_data_step_1 = replace(local.worker_user_data_raw, "__AWS_REGION__", var.aws_region)
  worker_user_data_step_2 = replace(local.worker_user_data_step_1, "__PROVIDER_NAME__", var.provider_name)
  worker_user_data_step_3 = replace(local.worker_user_data_step_2, "__PROVIDER_VERSION__", var.provider_version)
  worker_user_data_step_4 = replace(local.worker_user_data_step_3, "__NAME_PREFIX__", var.name_prefix)
  worker_user_data_step_5 = replace(local.worker_user_data_step_4, "__ROOT_VOLUME_SIZE_GB__", tostring(var.root_volume_size_gb))
  worker_user_data        = local.worker_user_data_step_5
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

data "aws_subnet" "selected" {
  for_each = length(local.subnet_ids) > 0 ? toset(local.subnet_ids) : toset([])

  id = each.value
}

data "aws_availability_zones" "available" {
  count = length(local.subnet_ids) == 0 ? 1 : 0

  state = "available"
}

resource "aws_vpc" "worker" {
  count = length(local.subnet_ids) == 0 ? 1 : 0

  cidr_block           = "10.60.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = merge(local.common_tags, {
    Name    = "${var.name_prefix}-build-vpc"
    Service = "pipeline-build-worker"
  })
}

resource "aws_internet_gateway" "worker" {
  count = length(local.subnet_ids) == 0 ? 1 : 0

  vpc_id = aws_vpc.worker[0].id

  tags = merge(local.common_tags, {
    Name    = "${var.name_prefix}-build-igw"
    Service = "pipeline-build-worker"
  })
}

resource "aws_subnet" "worker_public" {
  count = length(local.subnet_ids) == 0 ? 1 : 0

  vpc_id                  = aws_vpc.worker[0].id
  cidr_block              = "10.60.1.0/24"
  availability_zone       = data.aws_availability_zones.available[0].names[0]
  map_public_ip_on_launch = true

  tags = merge(local.common_tags, {
    Name    = "${var.name_prefix}-build-public-1"
    Service = "pipeline-build-worker"
    Tier    = "public"
  })
}

resource "aws_route_table" "worker_public" {
  count = length(local.subnet_ids) == 0 ? 1 : 0

  vpc_id = aws_vpc.worker[0].id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.worker[0].id
  }

  tags = merge(local.common_tags, {
    Name    = "${var.name_prefix}-build-public-rt"
    Service = "pipeline-build-worker"
  })
}

resource "aws_route_table_association" "worker_public" {
  count = length(local.subnet_ids) == 0 ? 1 : 0

  route_table_id = aws_route_table.worker_public[0].id
  subnet_id      = aws_subnet.worker_public[0].id
}

locals {
  worker_subnet_ids     = length(local.subnet_ids) == 0 ? aws_subnet.worker_public[*].id : local.subnet_ids
  worker_subnet_vpc_ids = length(local.subnet_ids) == 0 ? [aws_vpc.worker[0].id] : distinct([for subnet in data.aws_subnet.selected : subnet.vpc_id])
  worker_vpc_id         = local.worker_subnet_vpc_ids[0]
}

check "worker_subnets_same_vpc" {
  assert {
    condition     = length(local.subnet_ids) == 0 || length(local.worker_subnet_vpc_ids) == 1
    error_message = "All provided subnet_ids must belong to the same VPC."
  }
}

check "worker_subnets_available" {
  assert {
    condition     = length(local.worker_subnet_ids) > 0
    error_message = "No subnets were found. Provide subnet_ids or let the stack create managed public subnets."
  }
}

resource "aws_security_group" "worker" {
  name_prefix = "${var.name_prefix}-build-"
  description = "Security group for the HashPass pipeline build worker"
  vpc_id      = local.worker_vpc_id

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
      description = "Optional SSH access for worker maintenance"
      from_port   = 22
      to_port     = 22
      protocol    = "tcp"
      cidr_blocks = var.allowed_ssh_cidrs
    }
  }

  tags = merge(local.common_tags, {
    Name    = "${var.name_prefix}-build-sg"
    Service = "pipeline-build-worker"
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

resource "aws_iam_role" "worker" {
  name               = "${var.name_prefix}-build-role"
  assume_role_policy = data.aws_iam_policy_document.assume_ec2.json
  tags               = local.common_tags
}

resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.worker.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_role_policy_attachment" "codepipeline_custom_action" {
  role       = aws_iam_role.worker.name
  policy_arn = "arn:aws:iam::aws:policy/AWSCodePipelineCustomActionAccess"
}

resource "aws_iam_instance_profile" "worker" {
  name_prefix = "${var.name_prefix}-build-"
  role        = aws_iam_role.worker.name
  tags        = local.common_tags
}

resource "aws_instance" "worker" {
  count = var.instance_count

  ami                         = data.aws_ami.ubuntu.id
  instance_type               = var.instance_type
  subnet_id                   = local.worker_subnet_ids[count.index % length(local.worker_subnet_ids)]
  associate_public_ip_address = var.associate_public_ip_address
  vpc_security_group_ids      = [aws_security_group.worker.id]
  iam_instance_profile        = aws_iam_instance_profile.worker.name
  monitoring                  = var.detailed_monitoring
  user_data_replace_on_change = true
  user_data                   = local.worker_user_data

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
    Name     = "${var.name_prefix}-build-${count.index + 1}"
    Service  = "pipeline-build-worker"
    Worker   = var.name_prefix
    Provider = var.provider_name
    Role     = "pipeline-build-worker"
  })
}

resource "aws_cloudwatch_metric_alarm" "cpu_high" {
  count = var.instance_count

  alarm_name          = "${var.name_prefix}-build-${count.index + 1}-cpu-high"
  alarm_description   = "CPU utilization for worker instance ${count.index + 1} is above threshold."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  datapoints_to_alarm = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 300
  statistic           = "Average"
  threshold           = 85
  treat_missing_data  = "missing"

  dimensions = {
    InstanceId = aws_instance.worker[count.index].id
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "status_check_instance" {
  count = var.instance_count

  alarm_name          = "${var.name_prefix}-build-${count.index + 1}-status-check-instance"
  alarm_description   = "EC2 instance status check failed for worker ${count.index + 1}."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "StatusCheckFailed_Instance"
  namespace           = "AWS/EC2"
  period              = 300
  statistic           = "Maximum"
  threshold           = 0
  treat_missing_data  = "breaching"

  dimensions = {
    InstanceId = aws_instance.worker[count.index].id
  }

  tags = local.common_tags
}

resource "aws_cloudwatch_metric_alarm" "status_check_system" {
  count = var.instance_count

  alarm_name          = "${var.name_prefix}-build-${count.index + 1}-status-check-system"
  alarm_description   = "EC2 system status check failed for worker ${count.index + 1}."
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "StatusCheckFailed_System"
  namespace           = "AWS/EC2"
  period              = 300
  statistic           = "Maximum"
  threshold           = 0
  treat_missing_data  = "breaching"

  dimensions = {
    InstanceId = aws_instance.worker[count.index].id
  }

  tags = local.common_tags
}

locals {
  dashboard_widgets = [
    for index, instance in aws_instance.worker : {
      type   = "metric"
      x      = 0
      y      = index * 6
      width  = 12
      height = 6
      properties = {
        title  = "${var.name_prefix}-build-${index + 1}"
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

resource "aws_cloudwatch_dashboard" "worker" {
  dashboard_name = "${var.name_prefix}-build"
  dashboard_body = jsonencode({
    widgets = local.dashboard_widgets
  })
}

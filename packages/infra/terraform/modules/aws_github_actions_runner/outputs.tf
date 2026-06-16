output "security_group_id" {
  description = "Security group attached to runner instances"
  value       = aws_security_group.runner.id
}

output "iam_role_name" {
  description = "IAM role name used by the runner"
  value       = aws_iam_role.runner.name
}

output "instance_profile_name" {
  description = "IAM instance profile name used by the runner"
  value       = aws_iam_instance_profile.runner.name
}

output "instance_ids" {
  description = "EC2 instance IDs for the runner fleet"
  value       = [for instance in aws_instance.runner : instance.id]
}

output "private_ips" {
  description = "Private IP addresses for the runner fleet"
  value       = [for instance in aws_instance.runner : instance.private_ip]
}

output "public_ips" {
  description = "Public IP addresses for the runner fleet"
  value       = [for instance in aws_instance.runner : instance.public_ip]
}

output "dashboard_name" {
  description = "CloudWatch dashboard name for the runner fleet"
  value       = aws_cloudwatch_dashboard.runner.dashboard_name
}

output "dashboard_url" {
  description = "Console URL for the runner CloudWatch dashboard"
  value       = "https://${var.aws_region}.console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards:name=${aws_cloudwatch_dashboard.runner.dashboard_name}"
}

output "cpu_alarm_names" {
  description = "CloudWatch CPU alarms for each runner instance"
  value       = [for alarm in aws_cloudwatch_metric_alarm.cpu_high : alarm.alarm_name]
}

output "status_alarm_names" {
  description = "CloudWatch status check alarms for each runner instance"
  value = {
    instance = [for alarm in aws_cloudwatch_metric_alarm.status_check_instance : alarm.alarm_name]
    system   = [for alarm in aws_cloudwatch_metric_alarm.status_check_system : alarm.alarm_name]
  }
}

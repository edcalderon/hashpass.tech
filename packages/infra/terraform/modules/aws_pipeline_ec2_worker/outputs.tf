output "security_group_id" {
  description = "Security group attached to worker instances"
  value       = aws_security_group.worker.id
}

output "iam_role_name" {
  description = "IAM role name used by the worker"
  value       = aws_iam_role.worker.name
}

output "instance_profile_name" {
  description = "IAM instance profile name used by the worker"
  value       = aws_iam_instance_profile.worker.name
}

output "instance_ids" {
  description = "EC2 instance IDs for the worker fleet"
  value       = [for instance in aws_instance.worker : instance.id]
}

output "private_ips" {
  description = "Private IP addresses for the worker fleet"
  value       = [for instance in aws_instance.worker : instance.private_ip]
}

output "public_ips" {
  description = "Public IP addresses for the worker fleet"
  value       = [for instance in aws_instance.worker : instance.public_ip]
}

output "dashboard_name" {
  description = "CloudWatch dashboard name for the worker fleet"
  value       = aws_cloudwatch_dashboard.worker.dashboard_name
}

output "dashboard_url" {
  description = "Console URL for the worker CloudWatch dashboard"
  value       = "https://${var.aws_region}.console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards:name=${aws_cloudwatch_dashboard.worker.dashboard_name}"
}

output "cpu_alarm_names" {
  description = "CloudWatch CPU alarms for each worker instance"
  value       = [for alarm in aws_cloudwatch_metric_alarm.cpu_high : alarm.alarm_name]
}

output "status_alarm_names" {
  description = "CloudWatch status check alarms for each worker instance"
  value = {
    instance = [for alarm in aws_cloudwatch_metric_alarm.status_check_instance : alarm.alarm_name]
    system   = [for alarm in aws_cloudwatch_metric_alarm.status_check_system : alarm.alarm_name]
  }
}

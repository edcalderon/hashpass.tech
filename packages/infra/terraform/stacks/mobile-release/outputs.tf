output "github_runner_token_secret_arn" {
  description = "Secrets Manager ARN for the GitHub runner PAT container"
  value       = var.create_github_runner_token_secret ? aws_secretsmanager_secret.github_runner_token[0].arn : null
}

output "runner_instance_ids" {
  description = "EC2 instance IDs for the runner fleet"
  value       = module.mobile_release_runner.instance_ids
}

output "runner_private_ips" {
  description = "Private IPs for the runner fleet"
  value       = module.mobile_release_runner.private_ips
}

output "runner_public_ips" {
  description = "Public IPs for the runner fleet"
  value       = module.mobile_release_runner.public_ips
}

output "runner_security_group_id" {
  description = "Security group attached to the runner fleet"
  value       = module.mobile_release_runner.security_group_id
}

output "runner_dashboard_name" {
  description = "CloudWatch dashboard name"
  value       = module.mobile_release_runner.dashboard_name
}

output "runner_dashboard_url" {
  description = "CloudWatch dashboard URL"
  value       = module.mobile_release_runner.dashboard_url
}

output "runner_cpu_alarm_names" {
  description = "CloudWatch CPU alarms"
  value       = module.mobile_release_runner.cpu_alarm_names
}

output "runner_status_alarm_names" {
  description = "CloudWatch status check alarms"
  value       = module.mobile_release_runner.status_alarm_names
}

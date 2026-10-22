output "ssm_activation_id" {
  description = "One-time hybrid activation ID. Provide only to the SSM registration playbook."
  value       = aws_ssm_activation.vps.id
  sensitive   = true
}

output "ssm_activation_code" {
  description = "One-time hybrid activation code. Provide only to the SSM registration playbook."
  value       = aws_ssm_activation.vps.activation_code
  sensitive   = true
}

output "roles_anywhere_trust_anchor_arn" {
  description = "Trust anchor ARN passed to the Roles Anywhere credential process."
  value       = try(aws_rolesanywhere_trust_anchor.workload[0].arn, null)
}

output "roles_anywhere_profile_arn" {
  description = "Profile ARN passed to the Roles Anywhere credential process."
  value       = try(aws_rolesanywhere_profile.workload[0].arn, null)
}

output "workload_role_arn" {
  description = "Least-privilege workload role assumed through Roles Anywhere."
  value       = try(aws_iam_role.workload[0].arn, null)
}

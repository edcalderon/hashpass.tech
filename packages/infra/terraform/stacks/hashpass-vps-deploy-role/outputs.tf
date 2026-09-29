output "github_actions_role_arn" {
  description = "Set this as the private SELF_HOSTED_VPS_DEPLOY_ROLE_ARN repository variable"
  value       = aws_iam_role.github_deploy.arn
}

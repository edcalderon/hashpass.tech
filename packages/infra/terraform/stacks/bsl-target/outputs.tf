output "worker_instance_ids" {
  description = "EC2 instance IDs for the BSL build worker fleet"
  value       = module.build_worker.instance_ids
}

output "worker_dashboard_url" {
  description = "Console URL for the BSL build worker CloudWatch dashboard"
  value       = module.build_worker.dashboard_url
}

output "prod_pipeline_name" {
  description = "Name of the production BSL CodePipeline"
  value       = aws_codepipeline.bsl_prod.name
}

output "dev_pipeline_name" {
  description = "Name of the dev BSL CodePipeline"
  value       = aws_codepipeline.bsl_dev.name
}

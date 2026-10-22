output "archive_bucket_name" {
  description = "Private versioned bucket containing encrypted Notion page archives"
  value       = aws_s3_bucket.archive.id
}

output "registry_table_name" {
  description = "DynamoDB table holding source IDs and content hashes"
  value       = aws_dynamodb_table.registry.name
}

output "lambda_function_name" {
  description = "Scheduled Notion archive importer Lambda"
  value       = aws_lambda_function.archive.function_name
}

output "schedule_enabled" {
  description = "Whether EventBridge is allowed to invoke the importer"
  value       = var.enable_schedule
}

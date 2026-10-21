output "bucket_name" {
  description = "Database backup bucket."
  value       = aws_s3_bucket.db_backups.bucket
}

output "bucket_arn" {
  value = aws_s3_bucket.db_backups.arn
}

output "writer_role_arn" {
  description = "Role for the nightly dump workflow (repo variable DB_BACKUP_WRITER_ROLE_ARN)."
  value       = aws_iam_role.writer.arn
}

output "reader_role_arn" {
  description = "Role for the quarterly restore drill (repo variable DB_BACKUP_READER_ROLE_ARN)."
  value       = aws_iam_role.reader.arn
}

output "alerts_topic_arn" {
  description = "SNS topic for backup freshness alerts (confirm the email subscription once)."
  value       = aws_sns_topic.alerts.arn
}

output "replica_bucket_name" {
  description = "Cross-region replica bucket (repo variable DB_BACKUP_REPLICA_BUCKET)."
  value       = aws_s3_bucket.replica.bucket
}

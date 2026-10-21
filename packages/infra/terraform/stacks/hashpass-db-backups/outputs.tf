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

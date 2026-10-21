output "bucket_name" {
  description = "Database backup bucket."
  value       = aws_s3_bucket.db_backups.bucket
}

output "bucket_arn" {
  value = aws_s3_bucket.db_backups.arn
}

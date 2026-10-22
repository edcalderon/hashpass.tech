output "bucket_name" {
  description = "Private S3 bucket used only for Plane attachments and uploads."
  value       = aws_s3_bucket.plane.id
}

output "access_key_id" {
  description = "Dedicated Plane storage access key ID; store only in private runtime configuration."
  value       = aws_iam_access_key.plane_storage.id
  sensitive   = true
}

output "secret_access_key" {
  description = "Dedicated Plane storage secret; store only in private runtime configuration."
  value       = aws_iam_access_key.plane_storage.secret
  sensitive   = true
}

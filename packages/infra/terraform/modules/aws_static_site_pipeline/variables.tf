variable "name_prefix" {
  description = "Prefix used for all resource names"
  type        = string
  default     = "hashpass"
}

variable "aws_region" {
  description = "AWS region for the target static site pipeline"
  type        = string
  default     = "us-east-2"
}

variable "environment" {
  description = "Deployment environment name"
  type        = string
}

variable "repository" {
  description = "GitHub repository in owner/name form"
  type        = string
  default     = "hashpass-tech/hashpass.tech"
}

variable "branch_name" {
  description = "Git branch deployed by the pipeline"
  type        = string
  default     = "main"
}

variable "connection_arn" {
  description = "AWS CodeConnections ARN for the GitHub source connection"
  type        = string
}

variable "buildspec_path" {
  description = "Buildspec path relative to the repository root"
  type        = string
  default     = "packages/tools/buildspecs/hashpass-web-deploy.yml"
}

variable "site_bucket_name" {
  description = "Optional explicit S3 bucket name for the site"
  type        = string
  default     = null
}

variable "artifact_bucket_name" {
  description = "Optional explicit S3 bucket name for pipeline artifacts"
  type        = string
  default     = null
}

variable "build_image" {
  description = "CodeBuild container image"
  type        = string
  default     = "aws/codebuild/standard:7.0"
}

variable "build_compute_type" {
  description = "CodeBuild compute type"
  type        = string
  default     = "BUILD_GENERAL1_MEDIUM"
}

variable "build_timeout" {
  description = "CodeBuild timeout in minutes"
  type        = number
  default     = 60
}

variable "enable_cloudfront" {
  description = "Whether to create the CloudFront distribution and private S3 origin access flow. Disable this when the account cannot create CloudFront yet."
  type        = bool
  default     = true
}

variable "build_environment" {
  description = "Additional CodeBuild environment variables"
  type        = map(string)
  default     = {}
}

variable "tags" {
  description = "Tags applied to all resources"
  type        = map(string)
  default     = {}
}

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

variable "build_action_provider_name" {
  description = "CodePipeline custom action provider name"
  type        = string
  default     = "hashpass-ec2-build"
}

variable "build_action_version" {
  description = "CodePipeline custom action provider version"
  type        = string
  default     = "1"
}

variable "build_action_timeout" {
  description = "Build action timeout in minutes"
  type        = number
  default     = 60
}

variable "build_script_path" {
  description = "Build script path relative to the repository root"
  type        = string
  default     = "packages/tools/scripts/build-static-site.sh"
}

variable "build_output_directory" {
  description = "Directory packaged into the output artifact"
  type        = string
  default     = "dist/client"
}

variable "deploy_script_path" {
  description = "Deploy script path relative to the repository root"
  type        = string
  default     = "packages/tools/scripts/deploy-static-site.sh"
}

variable "deploy_mode" {
  description = "How the build worker deploys the site. Use direct to run the deploy script on the worker, or artifact to let CodePipeline extract the output artifact to S3."
  type        = string
  default     = "direct"

  validation {
    condition     = contains(["direct", "artifact"], lower(trimspace(var.deploy_mode)))
    error_message = "deploy_mode must be either direct or artifact."
  }
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

variable "enable_cloudfront" {
  description = "Whether to create the CloudFront distribution and private S3 origin access flow. Disable this when the account cannot create CloudFront yet."
  type        = bool
  default     = true
}

variable "build_environment" {
  description = "Additional build environment variables"
  type        = map(string)
  default     = {}
}

variable "tags" {
  description = "Tags applied to all resources"
  type        = map(string)
  default     = {}
}

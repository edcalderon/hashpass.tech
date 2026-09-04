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

variable "account_id" {
  description = "AWS account ID used for generated bucket names"
  type        = string
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

variable "source_detect_changes" {
  description = "Whether CodeConnections automatically starts this pipeline for source changes. Keep true until the GitHub-hosted replacement has passed its observed deployment and rollback gates."
  type        = bool
  default     = true
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

variable "build_execution_mode" {
  description = "Build executor for this pipeline. CodeBuild is on-demand; custom is the legacy EC2 action."
  type        = string
  default     = "custom"

  validation {
    condition     = contains(["custom", "codebuild"], lower(trimspace(var.build_execution_mode)))
    error_message = "build_execution_mode must be custom or codebuild."
  }
}

variable "codebuild_project_name" {
  description = "Optional CodeBuild project name. When omitted, a project is created from the pipeline name."
  type        = string
  default     = ""
}

variable "codebuild_compute_type" {
  description = "CodeBuild compute class used by the on-demand executor."
  type        = string
  default     = "BUILD_GENERAL1_MEDIUM"
}

variable "codebuild_image" {
  description = "CodeBuild Linux standard image."
  type        = string
  default     = "aws/codebuild/standard:7.0"
}

variable "codebuild_lambda_function_arns" {
  description = "Lambda function ARNs the CodeBuild deploy step may update."
  type        = list(string)
  default     = []
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

variable "deploy_cloudfront_domain_name" {
  description = "Optional CloudFront custom domain name used by direct deployments to resolve the distribution ID at runtime."
  type        = string
  default     = ""
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

variable "custom_domain_name" {
  description = "Optional CloudFront custom domain name"
  type        = string
  default     = ""
}

variable "acm_certificate_arn" {
  description = "Optional ACM certificate ARN for a CloudFront custom domain"
  type        = string
  default     = ""
}

variable "artifact_bucket_name" {
  description = "Optional explicit S3 bucket name for pipeline artifacts"
  type        = string
  default     = null
}

variable "deploy_cloudfront_distribution_id" {
  description = "Optional CloudFront distribution ID to invalidate after direct deployments"
  type        = string
  default     = ""
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

# Opt-in path-filtered trigger (2026-07-28). Defaults preserve existing
# behavior (V1 pipeline, branch-only trigger via the CodeStarSourceConnection
# EventBridge rule) for any consumer of this module that doesn't set these --
# only set enable_path_filtered_trigger = true where you actually want it
# (see the bsl-target stack for the sibling implementation and the reasoning
# behind broad includes + precise excludes to stay under AWS's 8-item cap
# per list).
variable "enable_path_filtered_trigger" {
  description = "Upgrade to a V2 pipeline with a git file-path-filtered trigger instead of the V1 branch-only EventBridge trigger. Opt-in so existing consumers of this module are unaffected."
  type        = bool
  default     = false
}

variable "trigger_path_includes" {
  description = "File path include patterns for the trigger (max 8, AWS-enforced). Only used when enable_path_filtered_trigger is true."
  type        = list(string)
  default     = []
}

variable "trigger_path_excludes" {
  description = "File path exclude patterns for the trigger (max 8, AWS-enforced). Only used when enable_path_filtered_trigger is true."
  type        = list(string)
  default     = []
}

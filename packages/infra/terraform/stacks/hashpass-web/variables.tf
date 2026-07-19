variable "aws_region" {
  description = "AWS region for the target static site pipeline"
  type        = string
  default     = "us-east-2"
}

variable "name_prefix" {
  description = "Prefix used for resource names"
  type        = string
  default     = "hashpass"
}

variable "environment" {
  description = "Deployment environment"
  type        = string
  default     = "production"
}

variable "repository" {
  description = "GitHub repository in owner/name form"
  type        = string
  default     = "hashpass-tech/hashpass.tech"
}

variable "branch_name" {
  description = "Git branch deployed to the target account"
  type        = string
  default     = "main"
}

variable "connection_arn" {
  description = "AWS CodeConnections ARN for the GitHub source connection"
  type        = string
}

variable "supabase_url" {
  description = "Public Supabase URL for the production web build"
  type        = string
}

variable "supabase_key" {
  description = "Public Supabase anon key for the production web build"
  type        = string
}

variable "supabase_url_dev" {
  description = "Public Supabase URL for the development web build"
  type        = string
  default     = ""
}

variable "supabase_key_dev" {
  description = "Public Supabase anon key for the development web build"
  type        = string
  default     = ""
}

variable "google_client_id" {
  description = "Google OAuth client ID used during the web build"
  type        = string
  default     = ""
}

variable "ga_measurement_id" {
  description = "Google Analytics 4 measurement ID baked into the web build"
  type        = string
  default     = "G-BY2BLQFHC9"
}

variable "sentry_dsn" {
  description = "Sentry DSN baked into the web build (public/publishable key, safe to expose client-side). Empty disables Sentry.init() for the web bundle."
  type        = string
  default     = ""
}

variable "lambda_region" {
  description = "AWS region containing the Expo Router API Lambda functions"
  type        = string
  default     = "us-east-1"
}

variable "lambda_function_name" {
  description = "Production Expo Router API Lambda function name updated by the web pipeline"
  type        = string
  default     = "hashpass-prod-expo-router-api"
}

variable "dev_lambda_function_name" {
  description = "Development Expo Router API Lambda function name updated by the web pipeline"
  type        = string
  default     = "hashpass-dev-expo-router-api"
}

variable "api_version_url" {
  description = "Production API version endpoint verified after the web pipeline updates the Lambda"
  type        = string
  default     = "https://api.hashpass.tech/api/config/versions"
}

variable "dev_api_version_url" {
  description = "Development API version endpoint verified after the web pipeline updates the Lambda"
  type        = string
  default     = "https://api-dev.hashpass.tech/api/config/versions"
}

variable "enable_cloudfront" {
  description = "Whether to create CloudFront in the target account. Disable while the account cannot create new CloudFront resources."
  type        = bool
  default     = false
}

variable "dev_environment" {
  description = "Deployment environment name for the development pipeline"
  type        = string
  default     = "dev"
}

variable "dev_branch_name" {
  description = "Git branch deployed by the development pipeline"
  type        = string
  default     = "develop"
}

variable "dev_route53_zone_name" {
  description = "Route53 hosted zone name used to host the development web domain"
  type        = string
  default     = "hashpass.tech"
}

variable "dev_custom_domain_name" {
  description = "Custom domain name for the development web site"
  type        = string
  default     = "dev.hashpass.tech"
}

variable "dev_enable_cloudfront" {
  description = "Whether to create CloudFront for the development pipeline"
  type        = bool
  default     = false
}

variable "site_bucket_name" {
  description = "Optional explicit S3 bucket name for the site"
  type        = string
  default     = null
}

variable "site_route53_zone_name" {
  description = "Route53 hosted zone name for the production web domain"
  type        = string
  default     = "hashpass.tech"
}

variable "site_custom_domain_name" {
  description = "CloudFront custom domain name for the production site"
  type        = string
  default     = "hashpass.tech"
}

variable "site_acm_certificate_arn" {
  description = "ACM certificate ARN in us-east-1 for the production site CloudFront distribution"
  type        = string
  default     = ""
}

variable "site_route53_a_records" {
  description = "Optional literal A records for the production site when CloudFront is unavailable"
  type        = list(string)
  default     = []
}

variable "artifact_bucket_name" {
  description = "Optional explicit S3 bucket name for pipeline artifacts"
  type        = string
  default     = null
}

variable "dev_site_bucket_name" {
  description = "Optional explicit S3 bucket name for the development site"
  type        = string
  default     = null
}

variable "dev_artifact_bucket_name" {
  description = "Optional explicit S3 bucket name for development pipeline artifacts"
  type        = string
  default     = null
}

variable "dev_route53_a_records" {
  description = "Optional literal A records for the development site when CloudFront is unavailable"
  type        = list(string)
  default     = []
}

variable "build_action_provider_name" {
  description = "CodePipeline custom action provider name used by the shared EC2 worker"
  type        = string
  default     = "hashpass-ec2-build"
}

variable "build_action_version" {
  description = "CodePipeline custom action provider version used by the shared EC2 worker"
  type        = string
  default     = "2"
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
  description = "Deployment mode for the worker. Use direct to deploy from the EC2 worker, or artifact to hand off to a CodePipeline S3 deploy action."
  type        = string
  default     = "direct"

  validation {
    condition     = contains(["direct", "artifact"], lower(trimspace(var.deploy_mode)))
    error_message = "deploy_mode must be either direct or artifact."
  }
}

variable "build_worker_instance_count" {
  description = "Number of pipeline build worker instances to provision"
  type        = number
  default     = 1
}

variable "build_worker_instance_type" {
  description = "EC2 instance type for the pipeline build worker. Use a non-burstable shape for sustained builds."
  type        = string
  default     = "m6i.large"
}

variable "build_worker_subnet_ids" {
  description = "Subnet IDs where the pipeline build worker launches. Leave empty to let the stack create managed public subnets."
  type        = list(string)
  default     = []
}

variable "build_worker_associate_public_ip_address" {
  description = "Whether the pipeline build worker instances receive a public IP"
  type        = bool
  default     = true
}

variable "build_worker_allowed_ssh_cidrs" {
  description = "Optional CIDR ranges allowed to SSH into the pipeline build worker instances"
  type        = list(string)
  default     = []
}

variable "build_worker_root_volume_size_gb" {
  description = "Root EBS volume size in GB for the pipeline build worker"
  type        = number
  default     = 100
}

variable "build_worker_detailed_monitoring" {
  description = "Enable detailed EC2 monitoring for the pipeline build worker"
  type        = bool
  default     = true
}

variable "build_environment_overrides" {
  description = "Additional build environment variables"
  type        = map(string)
  default     = {}
}

variable "enable_github_actions_worker_control" {
  description = "Create an IAM OIDC role so GitHub Actions can start/stop the shared web EC2 worker and monitor CodePipeline. After enabling, copy the output github_actions_role_arn as GitHub variable AWS_WEB_PIPELINE_ROLE_ARN."
  type        = bool
  default     = false
}

variable "create_github_oidc_provider" {
  description = "Create the GitHub Actions OIDC identity provider. Set to false if the AWS account already has token.actions.githubusercontent.com configured."
  type        = bool
  default     = false
}

variable "github_actions_role_name" {
  description = "Name of the IAM role GitHub Actions assumes to control the shared web worker"
  type        = string
  default     = "hashpass-web-github-actions"
}

variable "tags" {
  description = "Tags applied to all resources"
  type        = map(string)
  default = {
    Project = "hashpass"
    Owner   = "platform"
  }
}

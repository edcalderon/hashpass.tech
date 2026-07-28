variable "name_prefix" {
  description = "Prefix used for all resource names"
  type        = string
  default     = "bsl-hashpass"
}

variable "aws_region" {
  description = "AWS region for the BSL pipeline and its EC2 worker"
  type        = string
  default     = "us-east-2"
}

variable "repository" {
  description = "GitHub repository in owner/name form -- must be the canonical org repo, never a personal fork (see the 2026-07-28 incident where the source-account pipelines pointed at edcalderon/hashpass.tech and silently went 3 days / ~14 releases stale)"
  type        = string
  default     = "hashpass-tech/hashpass.tech"
}

variable "connection_arn" {
  description = "Target-account AWS CodeConnections ARN for the GitHub source connection (already provisioned and AVAILABLE as of 2026-07-28 -- see .agents/active/task-aws-account-migration.md)"
  type        = string
}

variable "prod_branch_name" {
  description = "Git branch that deploys the production BSL stage"
  type        = string
  default     = "main"
}

variable "dev_branch_name" {
  description = "Git branch that deploys the dev BSL stage"
  type        = string
  default     = "develop"
}

variable "artifact_bucket_name" {
  description = "S3 bucket for CodePipeline artifacts (already exists in target: bsl-hashpass-pipelines-952191196420-us-east-2)"
  type        = string
}

variable "build_action_provider_name" {
  description = "CodePipeline custom action provider name for the BSL EC2 worker. Distinct from hashpass-web's \"hashpass-ec2-build\" so the two workers' job polling never collides."
  type        = string
  default     = "hashpass-bsl-ec2-build"
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
  description = "Build/deploy script path relative to the repository root -- runs the full SST deploy, not just a static build"
  type        = string
  default     = "packages/tools/scripts/build-bsl-infra.sh"
}

variable "build_output_directory" {
  description = "Marker directory the build script creates -- SST's own deploy has no separate build-output handoff, this only exists because the shared EC2 worker script always zips/uploads whatever OutputDirectory is configured"
  type        = string
  default     = "dist-bsl-deploy-marker"
}

# EC2 worker sizing. Matches the hashpass-web pattern: a non-burstable shape
# (t3a is burstable and throttled sustained Expo export builds during that
# migration -- see aws-account-cutover.md phase 1 notes), sized for the same
# kind of Node/pnpm/Expo build workload.
variable "instance_type" {
  description = "EC2 instance type for the BSL build worker"
  type        = string
  default     = "m6i.large"
}

variable "instance_count" {
  description = "Number of BSL worker instances"
  type        = number
  default     = 1
}

variable "subnet_ids" {
  description = "Subnet IDs where worker instances launch. Leave empty to let the module create managed public subnets."
  type        = list(string)
  default     = []
}

variable "associate_public_ip_address" {
  description = "Whether the worker instance receives a public IP"
  type        = bool
  default     = true
}

variable "allowed_ssh_cidrs" {
  description = "Optional CIDR ranges allowed to SSH into the worker instance"
  type        = list(string)
  default     = []
}

variable "root_volume_size_gb" {
  description = "Root EBS volume size in GB"
  type        = number
  default     = 100
}

variable "detailed_monitoring" {
  description = "Enable detailed EC2 monitoring"
  type        = bool
  default     = true
}

# BSL Supabase config, mirroring the (currently plaintext, matching this
# account's existing hashpass-web/mobile-release IAM convention of broad
# AdministratorAccess roles rather than least-privilege) env vars already
# set on the now-superseded bsl-hashpass-prod-build/bsl-hashpass-dev-build
# CodeBuild projects. Populate the real values in a gitignored
# terraform.tfvars, never commit them.
variable "supabase_url_prod" {
  description = "BSL production Supabase URL"
  type        = string
  sensitive   = true
}

variable "supabase_key_prod" {
  description = "BSL production Supabase publishable/anon key"
  type        = string
  sensitive   = true
}

variable "supabase_service_role_key_prod" {
  description = "BSL production Supabase service-role key"
  type        = string
  sensitive   = true
}

variable "supabase_db_url_prod" {
  description = "BSL production Supabase Postgres connection string"
  type        = string
  sensitive   = true
}

variable "supabase_url_dev" {
  description = "BSL dev Supabase URL"
  type        = string
  sensitive   = true
}

variable "supabase_key_dev" {
  description = "BSL dev Supabase publishable/anon key"
  type        = string
  sensitive   = true
}

variable "supabase_service_role_key_dev" {
  description = "BSL dev Supabase service-role key"
  type        = string
  sensitive   = true
}

variable "supabase_db_url_dev" {
  description = "BSL dev Supabase Postgres connection string"
  type        = string
  sensitive   = true
}

variable "build_environment_overrides" {
  description = "Additional build environment variables applied to both prod and dev actions"
  type        = map(string)
  default     = {}
}

variable "tags" {
  description = "Tags applied to all resources"
  type        = map(string)
  default = {
    Project   = "hashpass"
    Service   = "bsl-pipeline"
    ManagedBy = "terraform"
  }
}

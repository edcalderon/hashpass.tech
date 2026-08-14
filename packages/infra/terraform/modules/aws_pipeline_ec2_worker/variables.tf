variable "name_prefix" {
  description = "Prefix used for AWS resource names"
  type        = string
  default     = "hashpass"
}

variable "aws_region" {
  description = "AWS region for the pipeline worker"
  type        = string
  default     = "us-east-2"
}

variable "provider_name" {
  description = "CodePipeline custom action provider name"
  type        = string
  default     = "hashpass-ec2-build"
}

variable "provider_version" {
  description = "CodePipeline custom action provider version"
  type        = string
  default     = "2"
}

variable "instance_count" {
  description = "Number of worker instances to provision. Keep zero unless an approved, time-bound build-worker exception is required."
  type        = number
  default     = 0
}

variable "provisioning_enabled" {
  description = "Explicit break-glass acknowledgement required before this module can create persistent EC2 build workers."
  type        = bool
  default     = false
}

variable "provisioning_approval_reference" {
  description = "Auditable change, incident, or approval reference required whenever a persistent worker is provisioned."
  type        = string
  default     = ""
}

variable "instance_type" {
  description = "EC2 instance type for the worker. Use a non-burstable shape for sustained builds."
  type        = string
  default     = "m6i.large"
}

variable "subnet_ids" {
  description = "Subnet IDs where worker instances launch. Leave empty to let the stack create managed public subnets."
  type        = list(string)
  default     = []
}

variable "associate_public_ip_address" {
  description = "Whether the worker instances receive a public IP"
  type        = bool
  default     = true
}

variable "allowed_ssh_cidrs" {
  description = "Optional CIDR ranges allowed to SSH into the worker instances"
  type        = list(string)
  default     = []
}

variable "deploy_bucket_names" {
  description = "Optional S3 bucket names the worker can deploy to directly"
  type        = list(string)
  default     = []
}

variable "artifact_bucket_names" {
  description = "Optional S3 bucket names the worker can use for CodePipeline artifact upload and download"
  type        = list(string)
  default     = []
}

variable "lambda_function_names" {
  description = "Optional Lambda function names the worker can update during direct deployments"
  type        = list(string)
  default     = []
}

variable "lambda_region" {
  description = "AWS region containing the Lambda functions updated by the worker"
  type        = string
  default     = ""
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

variable "alarm_actions" {
  description = "SNS topic ARNs invoked when worker health alarms enter ALARM."
  type        = list(string)
  default     = []
}

variable "ok_actions" {
  description = "SNS topic ARNs invoked when worker health alarms recover."
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Tags applied to all worker resources"
  type        = map(string)
  default     = {}
}

variable "build_timeout_seconds" {
  description = "Maximum wall-clock time (seconds) worker-loop.sh lets a single BuildScript/DeployScript run before killing its entire process group and reporting the job as failed. Without this, a hang of any kind (a stuck DNS validation wait, a network stall, an orphaned process left behind when CodePipeline cancels a job out from under the worker) runs forever and blocks every subsequent job, since the worker processes one job at a time. Confirmed 2026-07-29: a cancelled bsl-hashpass-prod execution's build process was never killed and silently blocked a real rebuild for 20+ minutes until found and killed manually."
  type        = number
  default     = 2700
}

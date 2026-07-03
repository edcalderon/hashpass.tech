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
  description = "Number of worker instances to provision"
  type        = number
  default     = 1
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

variable "tags" {
  description = "Tags applied to all worker resources"
  type        = map(string)
  default     = {}
}

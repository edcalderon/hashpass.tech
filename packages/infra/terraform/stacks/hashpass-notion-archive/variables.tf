variable "aws_region" {
  description = "Hashpass AWS region for the serverless Notion archive"
  type        = string
  default     = "us-east-2"
}

variable "name_prefix" {
  description = "Prefix used for archive resources"
  type        = string
  default     = "hashpass-notion-archive"
}

variable "lambda_zip_path" {
  description = "Path to the packaged serverless archive Lambda ZIP"
  type        = string
  default     = "../../../../../notion-archive-lambda.zip"
}

variable "notion_token_parameter_name" {
  description = "Existing SSM SecureString name holding the dedicated read-only Notion integration token"
  type        = string
  default     = "/hashpass/production/notion-archive/token"
}

variable "notion_root_page_id_parameter_name" {
  description = "Existing SSM SecureString name holding the Hashpass CEO HQ root page ID"
  type        = string
  default     = "/hashpass/production/notion-archive/root-page-id"
}

variable "enable_schedule" {
  description = "Whether EventBridge may invoke the importer. Keep false until the first manual archive and restore drill pass."
  type        = bool
  default     = false
}

variable "schedule_expression" {
  description = "EventBridge cadence after the archive has been validated"
  type        = string
  default     = "rate(6 hours)"
}

variable "log_retention_days" {
  description = "CloudWatch retention for count-only archive logs"
  type        = number
  default     = 14
}

variable "tags" {
  description = "Additional tags applied to archive resources"
  type        = map(string)
  default     = {}
}

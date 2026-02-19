variable "azure_subscription_id" {
  description = "Azure subscription ID"
  type        = string
  sensitive   = true
}

variable "azure_region" {
  description = "Azure region for resources"
  type        = string
  default     = "brazilsouth"
}

variable "resource_group_name" {
  description = "Name of the resource group"
  type        = string
  default     = "hashpass-health-rg"
}

variable "app_service_plan_name" {
  description = "Name of the App Service Plan"
  type        = string
  default     = "hashpass-health-plan"
}

variable "app_service_name" {
  description = "Name of the App Service"
  type        = string
  default     = "hashpass-health-app"
}

variable "app_insights_name" {
  description = "Name of Application Insights instance"
  type        = string
  default     = "hashpass-health-insights"
}

variable "tags" {
  description = "Common tags for all resources"
  type        = map(string)
  default = {
    Project     = "hashpass"
    Environment = "production"
    ManagedBy   = "terraform"
  }
}

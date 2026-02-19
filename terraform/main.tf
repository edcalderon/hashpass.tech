terraform {
  required_version = ">= 1.0"
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }
}

provider "azurerm" {
  features {}
  subscription_id = var.azure_subscription_id
}

# Resource Group
resource "azurerm_resource_group" "rg" {
  name     = var.resource_group_name
  location = var.azure_region
  tags     = var.tags
}

# App Service Plan (Free tier)
resource "azurerm_service_plan" "plan" {
  name                = var.app_service_plan_name
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  os_type             = "Linux"
  sku_name            = "F1"  # Free tier

  tags = var.tags
}

# App Service (Health Check API)
resource "azurerm_linux_web_app" "app" {
  name                = var.app_service_name
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  service_plan_id     = azurerm_service_plan.plan.id

  site_config {
    always_on           = false  # Free tier doesn't support always_on
    http2_enabled       = true
    minimum_tls_version = "1.2"
  }

  app_settings = {
    "WEBSITES_ENABLE_APP_SERVICE_STORAGE" = "false"
    "SCM_DO_BUILD_DURING_DEPLOYMENT"      = "true"
    "NODE_ENV"                             = "production"
    "WEBSITE_RUN_FROM_PACKAGE"             = "1"
    "APPINSIGHTS_INSTRUMENTATIONKEY"       = azurerm_application_insights.insights.instrumentation_key
    "APPLICATIONINSIGHTS_CONNECTION_STRING"= azurerm_application_insights.insights.connection_string
  }

  https_only = true
  tags       = var.tags

  depends_on = [azurerm_service_plan.plan]
}

/* Application Insights disabled due to student subscription timeout issues.
   Can be added back later via Azure Portal or CLI when subscription upgraded. */

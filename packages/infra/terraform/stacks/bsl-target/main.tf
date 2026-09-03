data "aws_caller_identity" "current" {}

# Hybrid BSL dev (2026-07-28): the target account can't create new CloudFront
# distributions yet (AccessDenied: "account must be verified", confirmed via
# a real failed sst deploy -- see task-aws-account-migration.md). Rather than
# wait on that AWS Support ticket, dev keeps its existing SOURCE-account
# CloudFront distribution (already issued, already has its own ACM cert) and
# just gets a plain target-account S3 bucket as its origin instead of SST's
# placeholder.sst.dev + CloudFront-Function/KV routing. No new distribution,
# no domain validation needed -- this bucket is a private implementation
# detail behind an already-working public hostname.
resource "aws_s3_bucket" "bsl_dev_site" {
  bucket = "${var.name_prefix}-bsl-dev-site-${data.aws_caller_identity.current.account_id}-${var.aws_region}"
  tags   = merge(var.tags, { Environment = "dev", Service = "bsl-web" })
}

resource "aws_s3_bucket_website_configuration" "bsl_dev_site" {
  bucket = aws_s3_bucket.bsl_dev_site.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html"
  }
}

resource "aws_s3_bucket_public_access_block" "bsl_dev_site" {
  bucket = aws_s3_bucket.bsl_dev_site.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "bsl_dev_site" {
  bucket = aws_s3_bucket.bsl_dev_site.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadForWebsite"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.bsl_dev_site.arn}/*"
      }
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.bsl_dev_site]
}

# Hybrid BSL prod (2026-07-29): same shape as dev above, extended once dev
# proved stable through several clean deploy cycles. bsl.hashpass.tech's
# existing source-account distribution (E2FCDJB1JCS7TW, already issued cert)
# keeps serving the domain; only its origin changes, to this bucket.
resource "aws_s3_bucket" "bsl_prod_site" {
  bucket = "${var.name_prefix}-bsl-prod-site-${data.aws_caller_identity.current.account_id}-${var.aws_region}"
  tags   = merge(var.tags, { Environment = "production", Service = "bsl-web" })
}

resource "aws_s3_bucket_website_configuration" "bsl_prod_site" {
  bucket = aws_s3_bucket.bsl_prod_site.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html"
  }
}

resource "aws_s3_bucket_public_access_block" "bsl_prod_site" {
  bucket = aws_s3_bucket.bsl_prod_site.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "bsl_prod_site" {
  bucket = aws_s3_bucket.bsl_prod_site.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadForWebsite"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.bsl_prod_site.arn}/*"
      }
    ]
  })

  depends_on = [aws_s3_bucket_public_access_block.bsl_prod_site]
}

# The EC2 worker remains only as an explicit, break-glass rollback path. The
# normal BSL path is on-demand CodeBuild; the target account currently has
# capacity for the configured Linux build classes. Keeping the fallback
# declarative makes rollback possible without making a persistent worker part
# of the normal production cost or availability path.
locals {
  build_action_providers = {
    legacy      = var.build_action_provider_name
    production  = var.production_build_action_provider_name
    development = var.development_build_action_provider_name
  }
  production_build_is_codebuild  = lower(trimspace(var.production_build_execution_mode)) == "codebuild"
  development_build_is_codebuild = lower(trimspace(var.development_build_execution_mode)) == "codebuild"
}

check "custom_pipeline_requires_workers" {
  assert {
    condition = (
      (local.production_build_is_codebuild || var.enable_pipeline_build_workers) &&
      (local.development_build_is_codebuild || var.enable_pipeline_build_workers)
    )
    error_message = "An EC2 fallback pipeline requires enable_pipeline_build_workers=true; CodeBuild is the safe default."
  }
}

module "production_build_worker" {
  source = "../../modules/aws_pipeline_ec2_worker"

  name_prefix                     = "${var.name_prefix}-prod"
  aws_region                      = var.aws_region
  provider_name                   = var.production_build_action_provider_name
  provider_version                = var.build_action_version
  instance_count                  = var.enable_pipeline_build_workers && !local.production_build_is_codebuild ? var.instance_count : 0
  provisioning_enabled            = var.enable_pipeline_build_workers && !local.production_build_is_codebuild
  provisioning_approval_reference = var.pipeline_build_worker_approval_reference
  instance_type                   = var.instance_type
  subnet_ids                      = var.subnet_ids
  associate_public_ip_address     = var.associate_public_ip_address
  allowed_ssh_cidrs               = var.allowed_ssh_cidrs
  # SST's own deploy creates/updates its own S3/CloudFront/Route53/IAM
  # resources directly -- it isn't a "sync build output to a pre-existing
  # bucket" deploy like hashpass-web's, so the module's narrow
  # deploy_bucket_names/lambda_function_names grants don't cover what it
  # needs. AdministratorAccess below covers that instead, matching this
  # account's existing convention (BslHashpassPipelineRole and
  # BslHashpassCodeBuildRole are both AdministratorAccess already -- see
  # .agents/active/task-aws-account-migration.md for the note that this is
  # a known, pre-existing broad-permission pattern worth hardening
  # repo-wide later, not something newly introduced here).
  deploy_bucket_names   = []
  artifact_bucket_names = [var.artifact_bucket_name]
  lambda_function_names = []
  lambda_region         = var.aws_region
  root_volume_size_gb   = var.root_volume_size_gb
  detailed_monitoring   = var.detailed_monitoring
  tags                  = var.tags
}

module "development_build_worker" {
  source = "../../modules/aws_pipeline_ec2_worker"

  name_prefix                     = "${var.name_prefix}-dev"
  aws_region                      = var.aws_region
  provider_name                   = var.development_build_action_provider_name
  provider_version                = var.build_action_version
  instance_count                  = var.enable_pipeline_build_workers && !local.development_build_is_codebuild ? var.instance_count : 0
  provisioning_enabled            = var.enable_pipeline_build_workers && !local.development_build_is_codebuild
  provisioning_approval_reference = var.pipeline_build_worker_approval_reference
  instance_type                   = var.instance_type
  subnet_ids                      = var.subnet_ids
  associate_public_ip_address     = var.associate_public_ip_address
  allowed_ssh_cidrs               = var.allowed_ssh_cidrs
  deploy_bucket_names             = []
  artifact_bucket_names           = [var.artifact_bucket_name]
  lambda_function_names           = []
  lambda_region                   = var.aws_region
  root_volume_size_gb             = var.root_volume_size_gb
  detailed_monitoring             = var.detailed_monitoring
  tags                            = var.tags
}

moved {
  from = aws_iam_role_policy_attachment.worker_admin
  to   = aws_iam_role_policy_attachment.worker_admin["production"]
}

resource "aws_iam_role_policy_attachment" "worker_admin" {
  for_each = {
    production  = module.production_build_worker.iam_role_name
    development = module.development_build_worker.iam_role_name
  }

  role       = each.value
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

moved {
  from = aws_codepipeline_custom_action_type.ec2_build
  to   = aws_codepipeline_custom_action_type.ec2_build["legacy"]
}

resource "aws_codepipeline_custom_action_type" "ec2_build" {
  for_each      = local.build_action_providers
  category      = "Build"
  provider_name = each.value
  version       = var.build_action_version

  input_artifact_details {
    minimum_count = 1
    maximum_count = 1
  }

  output_artifact_details {
    minimum_count = 1
    maximum_count = 1
  }

  configuration_property {
    name        = "BuildScript"
    description = "Path to the shell script that performs the BSL deploy"
    key         = true
    required    = true
    secret      = false
    type        = "String"
  }

  configuration_property {
    name        = "OutputDirectory"
    description = "Marker directory packaged into the output artifact"
    key         = false
    required    = true
    secret      = false
    type        = "String"
  }

  configuration_property {
    name        = "BuildEnvironmentJson"
    description = "JSON map of build environment variables"
    key         = false
    required    = false
    secret      = false
    type        = "String"
  }

  tags = merge(var.tags, {
    ManagedBy = "terraform"
    Service   = "bsl-pipeline"
  })
}

locals {
  # Path-filtered triggers (2026-07-28): both bsl-target and hashpass-web
  # build from the same shared apps/mobile-app source, so genuinely shared
  # changes SHOULD trigger both -- that's correct, not a bug. What isn't
  # correct is BSL redeploying on a change that's purely hashpass-web infra
  # (or vice versa), or on changes to neither pipeline's inputs at all
  # (docs, other stacks, other apps). CodePipeline V2's native
  # trigger.git_configuration.push.file_paths (AWS's direct equivalent of
  # GitHub Actions' `paths:` filtering) solves this without any custom
  # webhook/Lambda dispatcher to build or maintain -- it's declared right
  # next to the pipeline it gates, and an execution that doesn't match never
  # starts at all (no wasted EC2 worker minutes on a "nothing to build" run).
  #
  # AWS caps file_paths includes/excludes at 8 items each (confirmed via a
  # real failed plan: "supports 8 item maximum"). Broad includes + precise
  # excludes fits comfortably within that on both sides, and is easier to
  # reason about than trying to enumerate every relevant path individually
  # under a hard 8-item ceiling.
  bsl_trigger_includes = [
    "apps/mobile-app/**",
    "packages/**",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
  ]

  # Everything under packages/** that is hashpass-web-only or belongs to an
  # unrelated stack -- i.e. not something a BSL deploy needs to react to.
  # Keep this list and hashpass-web's mirror-image exclude list (see
  # aws_static_site_pipeline module / hashpass-web stack) in sync when
  # adding a new terraform stack or tools script.
  bsl_trigger_excludes = [
    # A CBWeek tenant configuration/developer landing-page change is deployed
    # by its own event pipeline; it does not require a generic BSL rebuild.
    "apps/mobile-app/config/events.ts",
    "apps/mobile-app/app/demo.tsx",
    "packages/infra/terraform/stacks/hashpass-web/**",
    "packages/infra/terraform/stacks/hashpass-dns/**",
    "packages/infra/terraform/stacks/hashpass-api-target/**",
    "packages/infra/terraform/stacks/mobile-release-target/**",
    "packages/infra/terraform/stacks/mobile-release-legacy-source-account/**",
    "packages/infra/terraform/stacks/aws/**",
  ]

  prod_build_environment = merge(
    {
      AWS_DEFAULT_REGION                 = var.aws_region
      AWS_REGION                         = var.aws_region
      CI                                 = "1"
      TARGET_STAGE                       = "production"
      EXPO_PUBLIC_SUPABASE_URL           = var.supabase_url_prod
      NEXT_PUBLIC_SUPABASE_URL           = var.supabase_url_prod
      EXPO_PUBLIC_SUPABASE_KEY           = var.supabase_key_prod
      EXPO_PUBLIC_SUPABASE_ANON_KEY      = var.supabase_key_prod
      NEXT_PUBLIC_SUPABASE_ANON_KEY      = var.supabase_key_prod
      EXPO_PUBLIC_BSL_SUPABASE_URL_PROD  = var.supabase_url_prod
      EXPO_PUBLIC_BSL_SUPABASE_KEY_PROD  = var.supabase_key_prod
      EXPO_PUBLIC_BSL_SUPABASE_URL       = var.supabase_url_prod
      EXPO_PUBLIC_BSL_SUPABASE_KEY       = var.supabase_key_prod
      BSL_SUPABASE_SERVICE_ROLE_KEY_PROD = var.supabase_service_role_key_prod
      BSL_SUPABASE_SERVICE_ROLE_KEY      = var.supabase_service_role_key_prod
      BSL_SUPABASE_DB_URL_PROD           = var.supabase_db_url_prod
      BSL_SUPABASE_DB_URL                = var.supabase_db_url_prod
      EXPO_EXPORT_MAX_WORKERS            = "4"
      SITE_BUCKET_NAME                   = aws_s3_bucket.bsl_prod_site.bucket
    },
    var.build_environment_overrides
  )

  dev_build_environment = merge(
    {
      AWS_DEFAULT_REGION                = var.aws_region
      AWS_REGION                        = var.aws_region
      CI                                = "1"
      TARGET_STAGE                      = "dev"
      EXPO_PUBLIC_SUPABASE_URL          = var.supabase_url_dev
      NEXT_PUBLIC_SUPABASE_URL          = var.supabase_url_dev
      EXPO_PUBLIC_SUPABASE_KEY          = var.supabase_key_dev
      EXPO_PUBLIC_SUPABASE_ANON_KEY     = var.supabase_key_dev
      NEXT_PUBLIC_SUPABASE_ANON_KEY     = var.supabase_key_dev
      EXPO_PUBLIC_BSL_SUPABASE_URL_DEV  = var.supabase_url_dev
      EXPO_PUBLIC_BSL_SUPABASE_KEY_DEV  = var.supabase_key_dev
      EXPO_PUBLIC_BSL_SUPABASE_URL      = var.supabase_url_dev
      EXPO_PUBLIC_BSL_SUPABASE_KEY      = var.supabase_key_dev
      BSL_SUPABASE_SERVICE_ROLE_KEY_DEV = var.supabase_service_role_key_dev
      BSL_SUPABASE_SERVICE_ROLE_KEY     = var.supabase_service_role_key_dev
      BSL_SUPABASE_DB_URL_DEV           = var.supabase_db_url_dev
      BSL_SUPABASE_DB_URL               = var.supabase_db_url_dev
      EXPO_EXPORT_MAX_WORKERS           = "4"
      SITE_BUCKET_NAME                  = aws_s3_bucket.bsl_dev_site.bucket
    },
    var.build_environment_overrides
  )
}

# The BSL pipelines use a pre-existing shared artifact bucket. CodePipeline
# does not expire artifacts itself, so manage its short retention policy here.
resource "aws_s3_bucket_lifecycle_configuration" "pipeline_artifacts" {
  bucket = var.artifact_bucket_name

  rule {
    id     = "expire-ci-artifacts"
    status = "Enabled"

    filter {}

    expiration {
      days = 14
    }

    noncurrent_version_expiration {
      noncurrent_days = 7
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

resource "aws_cloudwatch_log_group" "bsl_prod_codebuild" {
  name              = "/aws/codebuild/${var.production_codebuild_project_name}"
  retention_in_days = 30
  tags              = merge(var.tags, { Environment = "production", Service = "bsl-codebuild" })
}

# This project was provisioned before the BSL target-account cutover and is
# now managed here so its buildspec, sizing, environment, logs, and timeout
# cannot silently drift back to the old SST/EC2 flow.
resource "aws_codebuild_project" "bsl_prod" {
  name          = var.production_codebuild_project_name
  description   = "On-demand production BSL static site build"
  service_role  = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/BslHashpassCodeBuildRole"
  build_timeout = var.build_action_timeout

  artifacts {
    type = "CODEPIPELINE"
  }

  cache {
    type     = "S3"
    location = "${var.artifact_bucket_name}/codebuild-cache"
  }

  environment {
    compute_type                = var.production_codebuild_compute_type
    image                       = "aws/codebuild/standard:7.0"
    type                        = "LINUX_CONTAINER"
    image_pull_credentials_type = "CODEBUILD"

    dynamic "environment_variable" {
      for_each = local.prod_build_environment

      content {
        name  = environment_variable.key
        value = environment_variable.value
        type  = "PLAINTEXT"
      }
    }
  }

  source {
    type      = "CODEPIPELINE"
    buildspec = "packages/tools/buildspecs/bsl-static-site-codebuild.yml"
  }

  logs_config {
    cloudwatch_logs {
      group_name  = aws_cloudwatch_log_group.bsl_prod_codebuild.name
      stream_name = "build"
    }
  }

  tags = merge(var.tags, { Environment = "production", Service = "bsl-codebuild" })
}

resource "aws_codepipeline" "bsl_prod" {
  name          = "bsl-hashpass-prod"
  role_arn      = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/BslHashpassPipelineRole"
  pipeline_type = "V2"

  artifact_store {
    location = var.artifact_bucket_name
    type     = "S3"
  }

  stage {
    name = "Source"

    action {
      name             = "Source"
      category         = "Source"
      owner            = "AWS"
      provider         = "CodeStarSourceConnection"
      version          = "1"
      output_artifacts = ["SourceArtifact"]

      configuration = {
        ConnectionArn        = var.connection_arn
        FullRepositoryId     = var.repository
        BranchName           = var.prod_branch_name
        OutputArtifactFormat = "CODE_ZIP"
      }
    }
  }

  stage {
    name = "Build"

    action {
      name             = "DeployInfra"
      category         = "Build"
      owner            = local.production_build_is_codebuild ? "AWS" : "Custom"
      provider         = local.production_build_is_codebuild ? "CodeBuild" : var.production_build_action_provider_name
      version          = local.production_build_is_codebuild ? "1" : var.build_action_version
      input_artifacts  = ["SourceArtifact"]
      output_artifacts = ["BuildArtifact"]
      configuration = local.production_build_is_codebuild ? {
        ProjectName = aws_codebuild_project.bsl_prod.name
        } : {
        BuildScript          = var.build_script_path_hybrid
        OutputDirectory      = var.build_output_directory
        BuildEnvironmentJson = jsonencode(local.prod_build_environment)
      }
    }
  }

  trigger {
    provider_type = "CodeStarSourceConnection"

    git_configuration {
      source_action_name = "Source"

      push {
        branches {
          includes = [var.prod_branch_name]
        }

        file_paths {
          includes = local.bsl_trigger_includes
          excludes = local.bsl_trigger_excludes
        }
      }
    }
  }

  tags = merge(var.tags, { Environment = "production" })

  depends_on = [aws_codebuild_project.bsl_prod, module.production_build_worker, aws_codepipeline_custom_action_type.ec2_build]
}

resource "aws_codepipeline" "bsl_dev" {
  name          = "bsl-hashpass-dev"
  role_arn      = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/BslHashpassPipelineRole"
  pipeline_type = "V2"

  artifact_store {
    location = var.artifact_bucket_name
    type     = "S3"
  }

  stage {
    name = "Source"

    action {
      name             = "Source"
      category         = "Source"
      owner            = "AWS"
      provider         = "CodeStarSourceConnection"
      version          = "1"
      output_artifacts = ["SourceArtifact"]

      configuration = {
        ConnectionArn        = var.connection_arn
        FullRepositoryId     = var.repository
        BranchName           = var.dev_branch_name
        OutputArtifactFormat = "CODE_ZIP"
      }
    }
  }

  stage {
    name = "Build"

    action {
      name             = "DeployInfra"
      category         = "Build"
      owner            = local.development_build_is_codebuild ? "AWS" : "Custom"
      provider         = local.development_build_is_codebuild ? "CodeBuild" : var.development_build_action_provider_name
      version          = local.development_build_is_codebuild ? "1" : var.build_action_version
      input_artifacts  = ["SourceArtifact"]
      output_artifacts = ["BuildArtifact"]

      # REVERTED 2026-08-06 (see bsl_prod's DeployInfra action above for the
      # full explanation): CodePipeline rejects timeout_in_minutes outright
      # for a Build-category action regardless of owner/provider --
      # confirmed via a real update-pipeline call against the sibling prod
      # action. Left out here for consistency; this stage's owner/provider
      # already branch on development_build_is_codebuild, so it would have
      # hit the same InvalidActionDeclarationException on the next apply
      # whichever path is active.

      configuration = local.development_build_is_codebuild ? {
        ProjectName = var.development_codebuild_project_name
        } : {
        BuildScript          = var.build_script_path_hybrid
        OutputDirectory      = var.build_output_directory
        BuildEnvironmentJson = jsonencode(local.dev_build_environment)
      }
    }
  }

  trigger {
    provider_type = "CodeStarSourceConnection"

    git_configuration {
      source_action_name = "Source"

      push {
        branches {
          includes = [var.dev_branch_name]
        }

        file_paths {
          includes = local.bsl_trigger_includes
          excludes = local.bsl_trigger_excludes
        }
      }
    }
  }

  tags = merge(var.tags, { Environment = "dev" })

  depends_on = [module.development_build_worker, aws_codepipeline_custom_action_type.ec2_build]
}

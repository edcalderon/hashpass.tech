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

# Reuses the same reusable EC2 build worker module hashpass-web already uses
# (packages/infra/terraform/stacks/hashpass-web), matching the decision
# (2026-07-28) to build BSL's target-account pipeline on a custom EC2 worker
# instead of AWS CodeBuild -- more control over the build environment, and
# the target account's CodeBuild concurrent-build quota was found to be 0
# for every environment type (a pre-existing account-wide restriction
# unrelated to BSL; AWS Support case 178525969200038 requests raising it,
# but EC2 sidesteps the wait entirely and matches the established pattern).
#
# This worker is dedicated to BSL, not shared with hashpass-web's worker --
# each pipeline family in this repo (mobile release, hashpass-web, now BSL)
# gets its own worker, which is the existing convention, not a new one.
module "build_worker" {
  source = "../../modules/aws_pipeline_ec2_worker"

  name_prefix                 = var.name_prefix
  aws_region                  = var.aws_region
  provider_name               = var.build_action_provider_name
  provider_version            = var.build_action_version
  instance_count              = var.instance_count
  instance_type               = var.instance_type
  subnet_ids                  = var.subnet_ids
  associate_public_ip_address = var.associate_public_ip_address
  allowed_ssh_cidrs           = var.allowed_ssh_cidrs
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

resource "aws_iam_role_policy_attachment" "worker_admin" {
  role       = module.build_worker.iam_role_name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

resource "aws_codepipeline_custom_action_type" "ec2_build" {
  category      = "Build"
  provider_name = var.build_action_provider_name
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
  ]

  # Everything under packages/** that is hashpass-web-only or belongs to an
  # unrelated stack -- i.e. not something a BSL deploy needs to react to.
  # Keep this list and hashpass-web's mirror-image exclude list (see
  # aws_static_site_pipeline module / hashpass-web stack) in sync when
  # adding a new terraform stack or tools script.
  bsl_trigger_excludes = [
    "packages/infra/terraform/stacks/hashpass-web/**",
    "packages/infra/terraform/stacks/hashpass-dns/**",
    "packages/infra/terraform/stacks/hashpass-api-target/**",
    "packages/infra/terraform/stacks/mobile-release-target/**",
    "packages/infra/terraform/stacks/mobile-release-legacy-source-account/**",
    "packages/infra/terraform/stacks/aws/**",
    "packages/infra/terraform/stacks/gcp/**",
    "packages/tools/scripts/build-static-site.sh",
  ]

  prod_build_environment = merge(
    {
      AWS_DEFAULT_REGION                 = var.aws_region
      AWS_REGION                         = var.aws_region
      CI                                 = "1"
      TARGET_STAGE                       = "prod"
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
      EXPO_EXPORT_MAX_WORKERS            = "6"
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
      EXPO_EXPORT_MAX_WORKERS           = "6"
      SITE_BUCKET_NAME                  = aws_s3_bucket.bsl_dev_site.bucket
    },
    var.build_environment_overrides
  )
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
      owner            = "Custom"
      provider         = var.build_action_provider_name
      version          = var.build_action_version
      input_artifacts  = ["SourceArtifact"]
      output_artifacts = ["BuildArtifact"]

      configuration = {
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

  depends_on = [module.build_worker, aws_codepipeline_custom_action_type.ec2_build]
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
      owner            = "Custom"
      provider         = var.build_action_provider_name
      version          = var.build_action_version
      input_artifacts  = ["SourceArtifact"]
      output_artifacts = ["BuildArtifact"]

      configuration = {
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

  depends_on = [module.build_worker, aws_codepipeline_custom_action_type.ec2_build]
}

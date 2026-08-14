# ============================================================================
# Pipelines that populate each demo event's site bucket, one per event.
# Source branch is always `develop` -- demo-mode tenants are guarded to
# development databases only (see apps/mobile-app/config/supabase-profiles.ts),
# so for now "develop" and "demo" are the same tag by design. Add another
# module block here (plus a matching origin_domain_name in main.tf's locals)
# for the next demo-mode event.
# ============================================================================

module "criptolatinfest_pipeline" {
  source = "../../modules/aws_static_site_pipeline"

  name_prefix    = "hashpass-criptolatinfest"
  environment    = "develop"
  aws_region     = var.aws_region
  account_id     = data.aws_caller_identity.current.account_id
  repository     = var.repository
  branch_name    = "develop"
  connection_arn = var.connection_arn

  # Explicit names (single source of truth: main.tf's locals, which the
  # CloudFront origin also reads) -- the module's own default naming for the
  # artifact bucket exceeds S3's 63-char limit once name_prefix is this long.
  site_bucket_name     = local.criptolatinfest_site_bucket_name
  artifact_bucket_name = local.criptolatinfest_artifact_bucket_name

  # Public S3 website hosting, not an OAC-gated bucket -- CloudFront for this
  # event is provisioned separately in main.tf (needs a custom cache policy
  # shared across demo events), so this module's own optional CloudFront
  # path stays off.
  enable_cloudfront = false

  build_execution_mode   = "codebuild"
  codebuild_compute_type = "BUILD_GENERAL1_LARGE"
  deploy_mode            = "direct"
  build_script_path      = "packages/tools/scripts/build-static-site.sh"
  build_output_directory = "dist/client"
  deploy_script_path     = "packages/tools/scripts/deploy-static-site.sh"

  # Invalidate the demo's own CloudFront distribution (main.tf) after every
  # deploy -- never bsl-dev's, this pipeline only ever writes to its own
  # dedicated bucket.
  deploy_cloudfront_distribution_id = aws_cloudfront_distribution.demo["criptolatinfest"].id
  deploy_cloudfront_domain_name     = var.demo_events["criptolatinfest"].subdomain

  build_environment = {
    AWS_DEFAULT_REGION = var.aws_region
    AWS_REGION         = var.aws_region
    CI                 = "1"
    TARGET_STAGE       = "develop"

    # See variables.tf -- the *real* bsl-development project, not
    # bsl-target's mismatched supabase_url_dev/supabase_key_dev.
    EXPO_PUBLIC_SUPABASE_URL          = var.bsl_dev_supabase_url
    NEXT_PUBLIC_SUPABASE_URL          = var.bsl_dev_supabase_url
    EXPO_PUBLIC_SUPABASE_KEY          = var.bsl_dev_supabase_key
    EXPO_PUBLIC_SUPABASE_ANON_KEY     = var.bsl_dev_supabase_key
    NEXT_PUBLIC_SUPABASE_ANON_KEY     = var.bsl_dev_supabase_key
    EXPO_PUBLIC_BSL_SUPABASE_URL_DEV  = var.bsl_dev_supabase_url
    EXPO_PUBLIC_BSL_SUPABASE_KEY_DEV  = var.bsl_dev_supabase_key
    EXPO_PUBLIC_BSL_SUPABASE_URL      = var.bsl_dev_supabase_url
    EXPO_PUBLIC_BSL_SUPABASE_KEY      = var.bsl_dev_supabase_key
    BSL_SUPABASE_SERVICE_ROLE_KEY_DEV = var.bsl_dev_supabase_service_role_key
    BSL_SUPABASE_SERVICE_ROLE_KEY     = var.bsl_dev_supabase_service_role_key
    BSL_SUPABASE_DB_URL_DEV           = var.bsl_dev_supabase_db_url
    BSL_SUPABASE_DB_URL               = var.bsl_dev_supabase_db_url

    # Matches hashpass-web's proven working dev pipeline config -- the
    # build script's own default (NODE_MAX_OLD_SPACE_SIZE=3072) is too low
    # for a full monorepo `expo export -p web` and OOMs (exit 134, confirmed
    # via a real failed build's CloudWatch logs). Fewer parallel export
    # workers reduces peak memory pressure too.
    NODE_MAX_OLD_SPACE_SIZE = "6144"
    EXPO_EXPORT_MAX_WORKERS = "1"
    SITE_API_VERSION_URL    = "https://api-dev.hashpass.tech/api/config/versions"
  }

  tags = merge(var.tags, { Event = "criptolatinfest" })
}

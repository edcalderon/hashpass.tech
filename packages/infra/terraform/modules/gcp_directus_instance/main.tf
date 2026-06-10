locals {
  instance_name       = "${var.name_prefix}-${var.environment}-directus"
  network_tag         = "${var.name_prefix}-${var.environment}-directus"
  use_inline_env      = var.directus_env_inline != null && trimspace(var.directus_env_inline) != ""
  use_inline_compose  = var.directus_compose_inline != null && trimspace(var.directus_compose_inline) != ""

  service_account_email = var.create_service_account ? google_service_account.this[0].email : var.service_account_email

  ports_as_strings = [for port in var.open_ports : tostring(port)]

  labels = merge(var.labels, {
    environment = var.environment
    managed_by  = "terraform"
    service     = "directus"
  })

  startup_script = templatefile("${path.module}/templates/startup.sh.tftpl", {
    project_id             = var.project_id
    directus_env_secret_id = var.directus_env_secret_id
    directus_env_inline    = var.directus_env_inline
    use_inline_env         = local.use_inline_env
    directus_compose_inline = var.directus_compose_inline
    use_inline_compose      = local.use_inline_compose
    domain_name            = var.domain_name
    repository_url         = var.startup_repository_url
    repository_ref         = var.startup_repository_ref
    compose_path           = var.directus_compose_path
    env_file_path          = var.directus_env_file_path
  })
}

check "service_account_email_required" {
  assert {
    condition     = var.create_service_account || trimspace(var.service_account_email == null ? "" : var.service_account_email) != ""
    error_message = "service_account_email must be set when create_service_account is false."
  }
}

check "dns_zone_required_when_dns_enabled" {
  assert {
    condition     = !var.enable_dns_record || trimspace(var.dns_managed_zone_name == null ? "" : var.dns_managed_zone_name) != ""
    error_message = "dns_managed_zone_name must be set when enable_dns_record is true."
  }
}

check "directus_env_source_required" {
  assert {
    condition     = local.use_inline_env || trimspace(var.directus_env_secret_id == null ? "" : var.directus_env_secret_id) != ""
    error_message = "Provide either directus_env_inline or directus_env_secret_id."
  }
}

resource "google_project_service" "required" {
  for_each = var.manage_project_services ? toset(var.required_project_services) : toset([])

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_service_account" "this" {
  count = var.create_service_account ? 1 : 0

  account_id   = substr(replace(local.instance_name, "_", "-"), 0, 30)
  display_name = "${upper(var.environment)} Directus Service Account"
  project      = var.project_id
}

resource "google_project_iam_member" "secret_accessor" {
  count = local.use_inline_env ? 0 : 1

  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${local.service_account_email}"
}

resource "google_compute_address" "this" {
  name    = "${local.instance_name}-ip"
  project = var.project_id
  region  = var.region
}

resource "google_compute_firewall" "this" {
  name    = "${local.instance_name}-fw"
  project = var.project_id
  network = var.network

  allow {
    protocol = "tcp"
    ports    = local.ports_as_strings
  }

  source_ranges = var.firewall_source_ranges
  target_tags   = concat([local.network_tag], var.tags)
}

resource "google_compute_instance" "this" {
  name         = local.instance_name
  project      = var.project_id
  zone         = var.zone
  machine_type = var.machine_type

  tags = concat([local.network_tag], var.tags)

  boot_disk {
    initialize_params {
      image = var.boot_image
      size  = var.boot_disk_size_gb
      type  = "pd-standard"
    }
  }

  network_interface {
    network = var.network

    access_config {
      nat_ip = google_compute_address.this.address
    }
  }

  service_account {
    email  = local.service_account_email
    scopes = ["cloud-platform"]
  }

  metadata_startup_script = local.startup_script

  labels = local.labels

  allow_stopping_for_update = true

  depends_on = [
    google_compute_firewall.this,
    google_project_service.required,
    google_project_iam_member.secret_accessor
  ]
}

resource "google_dns_record_set" "this" {
  count = var.enable_dns_record ? 1 : 0

  project      = var.project_id
  managed_zone = var.dns_managed_zone_name
  name         = "${var.domain_name}."
  type         = "A"
  ttl          = var.dns_record_ttl
  rrdatas      = [google_compute_address.this.address]
}

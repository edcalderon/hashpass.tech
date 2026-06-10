output "instance_name" {
  description = "Directus compute instance name"
  value       = google_compute_instance.this.name
}

output "instance_zone" {
  description = "Instance zone"
  value       = google_compute_instance.this.zone
}

output "external_ip" {
  description = "Static external IP attached to the instance"
  value       = google_compute_address.this.address
}

output "service_account_email" {
  description = "Service account used by the instance"
  value       = local.service_account_email
}

output "domain_name" {
  description = "Public domain configured for this instance"
  value       = var.domain_name
}

output "dns_record_fqdn" {
  description = "DNS record fqdn (if created by this module)"
  value       = var.enable_dns_record ? google_dns_record_set.this[0].name : null
}

output "ssh_command" {
  description = "SSH command to connect to the instance"
  value       = "gcloud compute ssh ${google_compute_instance.this.name} --project=${var.project_id} --zone=${google_compute_instance.this.zone}"
}

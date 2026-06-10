output "sso_instance_external_ip" {
  description = "The external IP address of the HashPass SSO instance"
  value       = google_compute_address.sso_ip.address
}

output "sso_instance_internal_ip" {
  description = "The internal IP address of the HashPass SSO instance"
  value       = google_compute_instance.sso_instance.network_interface[0].network_ip
}

output "sso_instance_name" {
  description = "The name of the HashPass SSO compute instance"
  value       = google_compute_instance.sso_instance.name
}

output "sso_instance_zone" {
  description = "The zone where the HashPass SSO instance is deployed"
  value       = google_compute_instance.sso_instance.zone
}

output "service_account_email" {
  description = "The email of the service account used by the instance"
  value       = google_service_account.hashpass_sso.email
}

output "sso_url" {
  description = "The URL for the HashPass SSO service"
  value       = "https://sso.hashpass.co"
}

output "setup_instructions" {
  description = "Post-deployment setup instructions"
  value = <<-EOT
    HashPass SSO Infrastructure Deployed Successfully!
    
    Next Steps:
    
    1. DNS Configuration:
       - Point sso.hashpass.co to: ${google_compute_address.sso_ip.address}
    
    2. SSH into the instance:
       - gcloud compute ssh ${google_compute_instance.sso_instance.name} --zone=${var.zone}
    
    3. Configure SSL certificate:
       - sudo certbot --nginx -d sso.hashpass.co
    
    4. Update Directus configuration (if needed):
       - Edit /opt/hashpass/docker-compose.yml
       - Run: cd /opt/hashpass && sudo docker-compose up -d
    
    5. Test the deployment:
       - Visit: https://sso.hashpass.co
       - Login with: ${var.admin_email}
    
    6. Configure your app:
       - Set EXPO_PUBLIC_BACKEND_PROVIDER=directus
       - Set EXPO_PUBLIC_DIRECTUS_URL=https://sso.hashpass.co
  EOT
}
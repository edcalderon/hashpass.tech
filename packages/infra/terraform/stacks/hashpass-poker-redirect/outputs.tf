output "hash_poker_room_distribution_id" {
  description = "CloudFront distribution serving pkrr.hashpass.tech"
  value       = module.hash_poker_room.cloudfront_distribution_id
}

output "pkrr_io_distribution_id" {
  description = "CloudFront distribution serving pkrr.io.hashpass.tech"
  value       = module.pkrr_io.cloudfront_distribution_id
}

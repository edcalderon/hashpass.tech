terraform {
  # Backend settings are supplied at init time by the operator. This keeps the
  # account-specific bucket and lock-table names out of the repository.
  backend "s3" {}
}

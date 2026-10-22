# Hashpass serverless Notion archive

This stack is the first-stage Hashpass knowledge-management MVP. It archives
only the shared Hashpass CEO HQ tree into a private S3 bucket and maintains a
DynamoDB hash registry so unchanged pages are not written again. It has no
public endpoint, Plane credential, Frappe service, or Notion write permission.

## Before the first apply

1. Create a Notion internal integration with **read content** capability only.
   Share only the Hashpass CEO HQ root page with that integration. Do not share
   a personal workspace root or use an interactive Codex/ChatGPT credential.
2. Store the integration token and the CEO HQ root page ID as the two SSM
   SecureStrings named by the Terraform variables. Do not put either value in
   `terraform.tfvars`, Git, shell history, or logs.
3. Build the Lambda bundle:

   ```bash
   bash packages/tools/scripts/package-notion-archive-lambda.sh
   ```

4. Verify the `hashpass` profile against the private expected account ID, then
   run a Terraform plan. The schedule defaults to `false`; the first run must
   be a deliberate Lambda invocation and archive inspection.

## Safety properties

- S3 is private, versioned, and encrypted with S3-managed encryption.
- The Lambda can write only the `notion/` archive prefix, read/write its own
  DynamoDB registry, read the two named SSM parameters, and write count-only
  CloudWatch logs.
- The object archive is written before its registry hash. A source item with
  the same canonical hash is skipped.
- The importer never deletes content. Hash-addressed archive keys and the
  DynamoDB registry make retries idempotent even if a manual invocation
  overlaps a failed/retried invocation.
- EventBridge remains disabled until a manual archive and restore/reconciliation
  drill pass.

Attachment binaries and Plane work-item materialization are deliberately not
enabled in this cost-capped stage. The raw page/block payload preserves the
metadata needed to add those capabilities later without expanding Notion scope.

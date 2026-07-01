STACK ?= aws
TFVARS ?= terraform.tfvars
WORKDIR := stacks/$(STACK)

.PHONY: init plan apply destroy fmt validate

init:
	terraform -chdir=$(WORKDIR) init

plan:
	terraform -chdir=$(WORKDIR) plan -var-file=$(TFVARS)

apply:
	terraform -chdir=$(WORKDIR) apply -var-file=$(TFVARS)

destroy:
	terraform -chdir=$(WORKDIR) destroy -var-file=$(TFVARS)

fmt:
	terraform -chdir=stacks/aws fmt -recursive
	terraform -chdir=stacks/gcp fmt -recursive
	terraform -chdir=stacks/mobile-release fmt -recursive
	terraform -chdir=stacks/mobile-release-target fmt -recursive
	terraform -chdir=stacks/hashpass-dns fmt -recursive
	terraform -chdir=stacks/hashpass-api-target fmt -recursive
	terraform -chdir=stacks/hashpass-web fmt -recursive
	terraform -chdir=modules/aws_expo_router_api fmt -recursive
	terraform -chdir=modules/aws_amplify_domain fmt -recursive
	terraform -chdir=modules/gcp_directus_instance fmt -recursive
	terraform -chdir=modules/aws_github_actions_runner fmt -recursive
	terraform -chdir=modules/aws_pipeline_ec2_worker fmt -recursive
	terraform -chdir=modules/aws_static_site_pipeline fmt -recursive

validate:
	terraform -chdir=stacks/aws validate
	terraform -chdir=stacks/gcp validate
	terraform -chdir=stacks/mobile-release validate
	terraform -chdir=stacks/mobile-release-target validate
	terraform -chdir=stacks/hashpass-dns validate
	terraform -chdir=stacks/hashpass-api-target init -backend=false
	terraform -chdir=stacks/hashpass-api-target validate
	terraform -chdir=stacks/hashpass-web init -backend=false
	terraform -chdir=stacks/hashpass-web validate
	terraform -chdir=modules/aws_github_actions_runner init -backend=false
	terraform -chdir=modules/aws_github_actions_runner validate
	terraform -chdir=modules/aws_pipeline_ec2_worker init -backend=false
	terraform -chdir=modules/aws_pipeline_ec2_worker validate
	terraform -chdir=modules/aws_expo_router_api init -backend=false
	terraform -chdir=modules/aws_expo_router_api validate
	terraform -chdir=modules/aws_static_site_pipeline init -backend=false
	terraform -chdir=modules/aws_static_site_pipeline validate

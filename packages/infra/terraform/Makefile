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
	terraform -chdir=modules/aws_expo_router_api fmt -recursive
	terraform -chdir=modules/aws_amplify_domain fmt -recursive
	terraform -chdir=modules/gcp_directus_instance fmt -recursive

validate:
	terraform -chdir=stacks/aws validate
	terraform -chdir=stacks/gcp validate

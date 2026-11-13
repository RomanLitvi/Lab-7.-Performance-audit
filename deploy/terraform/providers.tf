provider "aws" {
  region  = "eu-central-1"
  profile = var.aws_profile

  default_tags {
    tags = local.tags
  }
}

# CloudFront accepts ACM certificates only from us-east-1.
provider "aws" {
  alias   = "us_east_1"
  region  = "us-east-1"
  profile = var.aws_profile

  default_tags {
    tags = local.tags
  }
}

variable "aws_profile" {
  type    = string
  default = "personal"
}

locals {
  zone_name = "naukma.com"
  # The CloudFront function maps the first label "slow" to the slow/ prefix.
  hosts = {
    fast = "lab7.naukma.com"
    slow = "slow.lab7.naukma.com"
  }
  tags = {
    Project   = "naukma-lab7"
    ManagedBy = "terraform"
  }
}

data "aws_caller_identity" "current" {}

data "aws_route53_zone" "this" {
  name = local.zone_name
}

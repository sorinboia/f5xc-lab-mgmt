variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-west-2"
}

variable "ssh_key_path" {
  description = "Path to the SSH public key"
  type        = string
  default     = "./id_rsa.pub"  # Update this path to match your key location
}

variable "instance_type" {
  description = "EC2 instance type"
  type        = string
  default     = "g4dn.xlarge"  # You can change the default or override it during deployment
}

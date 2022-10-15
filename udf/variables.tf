resource "random_id" "random-string" {
  byte_length = 4
}

variable "user_id" {
  default = "sorin"
}

variable "aws_region" {
  default = "eu-west-2"
}

variable "aws_az1" {
  default = "eu-west-2a"
}

variable "aws_az2" {
  default = "eu-west-2b"
}

variable "management_subnet_cidr" {
  description = "CIDR for the Management subnet"
  default     = "10.0.1.0/24"
}

variable "public_subnet_cidr" {
  description = "CIDR for the public subnet"
  default     = "10.0.2.0/24"
}

variable "private_subnet_cidr" {
  description = "CIDR for the private subnet"
  default     = "10.0.3.0/24"
}

resource "aws_key_pair" "aws_key" {
  key_name   = "ssh_key"
  public_key = file("/home/ubuntu/lab/udf/aws_public.pub")
}
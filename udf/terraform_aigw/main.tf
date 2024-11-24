terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
  required_version = ">= 1.2.0"
}

provider "aws" {
  region = var.aws_region
}

# VPC Configuration
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "g4dn-vpc"
  }
}

# Public Subnet
resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = "${var.aws_region}a"
  map_public_ip_on_launch = true

  tags = {
    Name = "g4dn-public-subnet"
  }
}

# Internet Gateway
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "g4dn-igw"
  }
}

# Route Table
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name = "g4dn-public-rt"
  }
}

# Route Table Association
resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

# Security Group
resource "aws_security_group" "instance_sg" {
  name        = "g4dn-instance-sg"
  description = "Security group for G4DN instance"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "SSH access"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTP access"
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "Ollama API access"
    from_port   = 11434
    to_port     = 11434
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "g4dn-sg"
  }
}


data "aws_ami" "amazon_linux_gpu" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["amzn2-ami-ecs-gpu-hvm-2.0.*-x86_64-ebs"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# SSH Key Pair
resource "aws_key_pair" "deployer" {
  key_name   = "g4dn-key"
  public_key = file(var.ssh_key_path)
}

data "local_file" "setup_script" {
  filename = "${path.module}/setup.sh"
}

# EC2 Instance
resource "aws_instance" "ollama" {
  ami           = data.aws_ami.amazon_linux_gpu.id
  instance_type = var.instance_type

  subnet_id                   = aws_subnet.public.id
  vpc_security_group_ids      = [aws_security_group.instance_sg.id]
  associate_public_ip_address = true
  key_name                   = aws_key_pair.deployer.key_name

  root_block_device {
    volume_size = 100  # GB
    volume_type = "gp3"
  }

  # Provide the setup.sh script as user data
  user_data = data.local_file.setup_script.content

  tags = {
    Name = "g4dn-instance"
  }
}

# Output the public IP


output "ollama_public_ip" {
  description = "Public IP of the Ollama instance"
  value       = aws_instance.ollama.public_ip
}



# Output the Web UI URL
output "webui_url" {
  description = "URL for the Open WebUI"
  value       = "http://${aws_instance.ollama.public_ip}:8080"
}

# Output the Ollama API endpoint
output "ollama_api_endpoint" {
  description = "Ollama API endpoint"
  value       = "http://${aws_instance.ollama.public_ip}:11434"
}

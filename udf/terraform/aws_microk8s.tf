data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-20240927"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_instance" "microk8s" {
  ami           = data.aws_ami.ubuntu.image_id
  instance_type = "t2.large"
  root_block_device {
    volume_size = "50"
  }

  associate_public_ip_address = true
  key_name                    = aws_key_pair.aws_key.key_name
  
  availability_zone           = var.aws_az1
  subnet_id                   = aws_subnet.public-subnet.id
  vpc_security_group_ids      = [aws_security_group.sgweb.id]

}
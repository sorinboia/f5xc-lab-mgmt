data "aws_ami" "ubuntu" {
  most_recent = true

  filter {
    name   = "name"
    values = ["*ubuntu*22.04*amd64*20221014"]
  }
}

resource "aws_instance" "microk8s" {
  ami           = data.aws_ami.ubuntu.image_id
  instance_type = "t2.medium"

  associate_public_ip_address = true
  key_name                    = aws_key_pair.aws_key.key_name
  
  availability_zone           = var.aws_az1
  subnet_id                   = aws_subnet.public-subnet.id
  vpc_security_group_ids      = [aws_security_group.sgweb.id]


  user_data = <<-EOF
      #!/bin/bash
      set -e

      apt-get update -y
      apt-get upgrade -y

      snap install microk8s --classic
      microk8s.start
      microk8s.enable dns ingress
      usermod -a -G microk8s ubuntu

    EOF


}
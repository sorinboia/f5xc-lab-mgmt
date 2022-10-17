output "region" {
  value = var.aws_region
}

output "vpc_id" {
  value = aws_vpc.main.id
}

output "az" {
  value = var.aws_az1
}

output "subnet_id" {
  value = aws_subnet.public-subnet.id
}

output "microk8s_ip" {
  value = aws_instance.microk8s.public_ip
}
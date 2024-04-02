locals {
  ce_cluster_name = "sorin-gcp-manual-test1"
    
  config_content = <<-EOT
    Vpm:
        ClusterName: ${local.ce_cluster_name}
        ClusterType: ce
        Token: 771e948b-f6ef-4338-9b50-953762f7a2a7
        Latitude: 50.44816
        Longitude: 3.81886
        MauricePrivateEndpoint: https://register-tls.ves.volterra.io
        MauriceEndpoint: https://register.ves.volterra.io
        CertifiedHardwareEndpoint: https://vesio.blob.core.windows.net/releases/certified-hardware/gcp.yml
    Kubernetes:
        CloudProvider: ""
        EtcdUseTLS: True
        Server: vip
    EOT
}

data "template_file" "ce_user_data" {
  template = file("ce_user_data.tpl")

  vars = {
    #ssh_public_key     = file(var.ssh_public_key)
    config_content     = base64encode(local.config_content)    
  }
}




resource "aws_instance" "ce" {
  ami           = "ami-05f5a414a42961df6"
  instance_type = "t3.xlarge"
  root_block_device {
    volume_size = "100"
  }

  associate_public_ip_address = true
  key_name                    = aws_key_pair.aws_key.key_name
  
  availability_zone           = var.aws_az1
  subnet_id                   = aws_subnet.public-subnet.id
  vpc_security_group_ids      = [aws_security_group.sgweb.id]
  user_data                   = data.template_file.ce_user_data.rendered

}



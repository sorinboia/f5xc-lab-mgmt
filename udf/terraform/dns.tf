resource "aws_route53_zone" "private" {
  name = "aws.internal"

  vpc {
    vpc_id = aws_vpc.main.id
  }
}

resource "aws_route53_record" "arcadia" {
  zone_id = aws_route53_zone.private.zone_id
  name    = "arcadiaaws.aws.internal"
  type    = "A"
  ttl     = 300
  records = [aws_instance.microk8s.ip]
}
#cloud-config
ssh_authorized_keys:
  - ${ssh_public_key}
write_files:
  - path: /etc/hosts
    content: IyBJUHY0IGFuZCBJUHY2IGxvY2FsaG9zdCBhbGlhc2VzCjEyNy4wLjAuMSAgICAgICAgICAgbG9jYWxob3N0Cjo6MSAgICAgICAgICAgICAgICAgbG9jYWxob3N0CjEyNy4wLjEuMSAgIHZpcAoxNjkuMjU0LjE2OS4yNTQgICAgIG1ldGFkYXRhLmdvb2dsZS5pbnRlcm5hbA==
    permissions: 0644
    owner: root
    encoding: b64
  - path: /etc/vpm/config.yaml
    permissions: 0644
    owner: root
    encoding: b64
    content: ${config_content}
  - path: "/etc/systemd/chronyd.conf"
    permissions: 0420
    owner: root
    content: |
      pool pool.ntp.org iburst
      driftfile /var/lib/chrony/drift
      makestep 0.1 3
      rtcsync
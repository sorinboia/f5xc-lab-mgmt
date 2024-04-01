#cloud-config
ssh_authorized_keys:
  - ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC9a7yEEW1doV3T6RQQ7HqSc5zKqVsmE8+ANE0o6mNH0W/255M35TYKUao5Iz4QYA3ZqyBF3BBviW96XUibZ0XAMuxNU7uiySLCiOgm+aYyymRTqTgtebZJCQ3nPJbCIuqfZow4e98jImyEDn0MIuMBXAAD72hsaZjRGg+u42I/S+sMlm5s0xRihsLn/Su8ntr3tI2prA4W3h2oBEzNIRbg4/HtY3zv3cPwfXlH1xKSJDkUOHAWC9AzBsJ5q/b0MA7DjsDBa11b/McAAmaX4H17ed6N+h6QT8PWTJkxMew6OP8COERWi9tPyr8RTK9DuBa18g6V2VSGJBMpCzk72pdz sorin@TLV-L-00040841
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
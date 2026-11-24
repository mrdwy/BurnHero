#!/bin/bash
# Run inside the original root session after a second, key-authenticated login.
set -euo pipefail
[[ $EUID == 0 && $(. /etc/os-release; echo "$ID:$VERSION_ID") == debian:13 ]]
user=burnhero-deploy
# The second session writes its own fresh proof of access after authenticating.
home=$(getent passwd "$user" | cut -d: -f6)
[[ -n $home && -f /run/burnhero-ssh-challenge ]]
cmp /run/burnhero-ssh-challenge "$home/.burnhero-login-proof"
apt-get update
apt-get install -y sudo ufw fail2ban unattended-upgrades nginx docker.io docker-compose openssl
usermod -aG sudo "$user"
# Assign the deploy user's distinct sudo password in the provisioning terminal.
if passwd -S "$user" | grep -Eq '^[^ ]+ (L|NP) '; then passwd "$user"; fi
install -d /etc/ssh/sshd_config.d
cat >/etc/ssh/sshd_config.d/00-burnhero.conf <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
EOF
sshd -t
for rule in 'permitrootlogin no' 'passwordauthentication no' 'kbdinteractiveauthentication no' 'pubkeyauthentication yes'; do sshd -T -C "user=$user,host=localhost,addr=127.0.0.1" | grep -Fx "$rule" >/dev/null; done
ufw allow 22/tcp
ufw allow 8080/tcp
ufw default deny incoming
ufw --force enable
cat >/etc/fail2ban/jail.d/burnhero.local <<'EOF'
[sshd]
enabled = true
backend = systemd
EOF
cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
systemctl enable --now docker fail2ban apt-daily-upgrade.timer
systemctl restart fail2ban
systemctl reload ssh
ufw status verbose

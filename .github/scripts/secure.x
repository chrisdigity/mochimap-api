#!/bin/sh

## Firewall Configuration:
# allow outgoing (default)
# deny incoming (default)
# allow SSH custom port (40450)
# allow MySQL InnoDB Cluster nodes (3306)
# allow Mochimo nodes (2095)
# allow Cloudflare IPv4/6 to HTTPS (443)
## SSH CONFIGURATION
# change port to 40450
# refuse root "password" login
# refuse password authentication
# refuse challenge response authentication
# do not use PAM

# user input
read -p 'SSH User [root]: ' USERVAR
USERVAR=${USERVAR:-root}
read -p 'SSH host []: ' SERVERIPVAR
if test -z $SERVERIPVAR; then echo Server IPv4 cannot be empty; exit 1; fi

echo

### PRECONFIGURATION
## Optionally install security certificate
#scp -r .private/ssl/* $USERVAR@$SERVERIPVAR:/etc/ssl/
## Cleanup existing IP configurations before starting
ssh-keygen -f ~/.ssh/known_hosts -R $SERVERIPVAR
## Must have Authentication sub key under email_address...
## export OpenSSH key to id_rsa.pub
#gpg --export-ssh-key email_address > ~/.ssh/id_rsa.pub
## send ssh key to server
echo "Uploading credentials..."
ssh-copy-id -f -i ~/.ssh/id_rsa.pub $USERVAR@$SERVERIPVAR

if test $? -eq 0; then # execute configuration over ssh
echo "connecting to $SERVERIPVAR..."
ssh $USERVAR@$SERVERIPVAR -t '
  echo "CONNECTED!"
  echo
read -p "Please specify desired hostname: " SERVERVAR
if test -z $SERVERVAR; then echo Server Host cannot be empty; exit 1; fi
  echo "___"
  echo "set additional vars..."
export SSHCONFIG=/etc/ssh/sshd_config
  echo "___"
  echo "disable gui..."
systemctl set-default multi-user

  echo "___"
  echo "secure SSH connection to server"
( grep -q -E "^[#]?Port .*$" $SSHCONFIG &&
  sed -i -E "s/^[#]?Port .*$/Port 40450/g" $SSHCONFIG ||
  echo "Port 40450" >> $SSHCONFIG )
( grep -q -E "^[#]?PermitRootLogin .*$" $SSHCONFIG &&
  sed -i -E "s/^[#]?PermitRootLogin .*$/PermitRootLogin prohibit-password/g" $SSHCONFIG ||
  echo "PermitRootLogin prohibit-password" >> $SSHCONFIG )
( grep -q -E "^[#]?PasswordAuthentication .*$" $SSHCONFIG &&
  sed -i -E "s/^[#]?PasswordAuthentication .*$/PasswordAuthentication no/g" $SSHCONFIG ||
  echo "PasswordAuthentication no" >> $SSHCONFIG )
( grep -q -E "^[#]?ChallengeResponseAuthentication .*$" $SSHCONFIG &&
  sed -i -E "s/^[#]?ChallengeResponseAuthentication .*$/ChallengeResponseAuthentication no/g" $SSHCONFIG ||
  echo "ChallengeResponseAuthentication no" >> $SSHCONFIG )
( grep -q -E "^[#]?UsePAM .*$" $SSHCONFIG &&
  sed -i -E "s/^[#]?UsePAM .*$/UsePAM no/g" $SSHCONFIG ||
  echo "UsePAM no" >> $SSHCONFIG )
  echo "___"
  echo "configure firewall..."
  echo "allow outgoing, deny incoming (defaults)"
ufw default allow outgoing
ufw default deny incoming
  echo "allow any access to custom ssh port"
ufw allow 40450
  echo "allow MySQL Cluster nodes access to MySQL"
sudo ufw allow from 95.111.217.79 to any port 3306 # au
sudo ufw allow from 164.68.97.118 to any port 3306 # de
sudo ufw allow from 194.233.70.75 to any port 3306 # sg
sudo ufw allow from 209.145.57.0 to any port 3306  # us
  echo "allow any access to Mochimo communication"
ufw allow 2095
  echo "allow Cloudflare IPs access to https"
ufw allow from 173.245.48.0/20 to any port 443
ufw allow from 103.21.244.0/22 to any port 443
ufw allow from 103.22.200.0/22 to any port 443
ufw allow from 103.31.4.0/22 to any port 443
ufw allow from 141.101.64.0/18 to any port 443
ufw allow from 108.162.192.0/18 to any port 443
ufw allow from 190.93.240.0/20 to any port 443
ufw allow from 188.114.96.0/20 to any port 443
ufw allow from 197.234.240.0/22 to any port 443
ufw allow from 198.41.128.0/17 to any port 443
ufw allow from 162.158.0.0/15 to any port 443
ufw allow from 172.64.0.0/13 to any port 443
ufw allow from 131.0.72.0/22 to any port 443
ufw allow from 104.16.0.0/13 to any port 443
ufw allow from 104.24.0.0/14 to any port 443
ufw allow from 2400:cb00::/32 to any port 443
ufw allow from 2606:4700::/32 to any port 443
ufw allow from 2803:f800::/32 to any port 443
ufw allow from 2405:b500::/32 to any port 443
ufw allow from 2405:8100::/32 to any port 443
ufw allow from 2a06:98c0::/29 to any port 443
ufw allow from 2c0f:f248::/32 to any port 443
  echo "___"
  echo "enable firewall and reboot"
(echo "y" | ufw enable) && reboot
'

echo
echo "send cluster configuration scripts..."
scp -o ConnectTimeout=300 -P 40450 *.js $USERVAR@$SERVERIPVAR:~/

echo
echo "(re)connecting to $SERVERIPVAR..."
ssh -p 40450 $USERVAR@$SERVERIPVAR -t '
mysqlsh -f configure_instance.js
mysqlsh -f configure_cluster.js
mysqlrouter --bootstrap icadmin@localhost:3306 --conf-use-sockets --account $(hostname)router --account-create always --user root
cat <<EOF >/etc/systemd/system/mysqlrouter.service
[Unit]
Description=MochiMap MySql Router
After=network.target
[Service]
ExecStart=mysqlrouter
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable mysqlrouter.service
systemctl restart mysqlrouter.service
'

else

echo
read -p 'Configuration was not executed! Press enter to exit...'

fi

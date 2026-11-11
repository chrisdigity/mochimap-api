#!/bin/bash

  echo
  echo "  =========================="
  echo "  Mochimo API (Nodejs) Setup"
  echo "  =========================="
  echo
  echo "  The Mochimo API requires MySQL to store Blockchain data."
  echo
  echo "  MySQL InnoDB Cluster is a high availability solution for MySQL."
  echo "  A MySQL InnoDB Cluster SHOULD consist of AT LEAST 3 servers."
  echo "  It is recommended ONLY for multi server configurations."
  echo
while test -z "$ISCLUSTER"; do
  read -p 'Would you like to use MySQL InnoDB Cluster? (y|n): ' ISCLUSTER
done
if test "$ISCLUSTER" = "y"; then
  while test -z "$ISPRIMARY"; do
    read -p 'Is this the primary instance of the Cluster? (y|n): ' ISPRIMARY
  done
  if test "$ISPRIMARY" = "n"; then
    while test -z "$PRIMARYIP"; do
      read -p 'What is the IPv4 address of the primary instance? ' PRIMARYIP
    done
  fi
fi

  echo
  echo "  The Mochimo API requests \"detailed\" location data on network"
  echo "  nodes from IPInfo.io, but requires an Access Token to do so."
  echo "  https://ipinfo.io/signup for a free Access Token. Otherwise,"
  echo "  leave the token blank and location data will be omitted."
  echo
read -p 'IPInfo.io Access Token []: ' IPINFOTOKEN

  echo
read -p 'Please enter the server hostname (e.g. mochimo-api): ' SERVERHOST

  echo
  echo
  echo "  Mochimo API (Nodejs) Configuration Check"
  echo "  ========================================"
  echo
if test ! -z "$SERVERHOST";
then echo "  Hostname will be changed to $SERVERHOST"
fi
echo " The following will be installed:"
if test "$ISCLUSTER" = "y";
then echo "  - MySQL 8.0.28 Server, Shell and Router"
else echo "  - MySQL 8.0.28 Server and Shell"
fi
  echo "  - Nodejs LTS (latest)"
  echo "  - Process Manager (Nodejs)"
  echo "  - Mochimo API (Nodejs)"
  echo "  - Mochimo Node"

  echo
read -p 'Ctrl+C to abort. Press enter to continue...' ENTER
  echo

# install Mochimo node (FIRST so it has time to boot)
curl -sL https://github.com/mochimodev/mochimo/raw/master/.github/scripts/setup.x | bash -

# stop/disable default system apache service
systemctl stop apache2 && systemctl disable apache
# set hostname and update /etc/hosts
if test -z "$SERVERHOST"; then hostname "$SERVERHOST"; fi
echo "127.0.0.1 $(hostname)" >> /etc/hosts
# prepare apt configuration for Nodejs LTS (latest)
curl -sL https://deb.nodesource.com/setup_lts.x | bash -
# prepare apt configuration for MySQL 8.0.28
curl -OL https://dev.mysql.com/get/mysql-apt-config_0.8.22-1_all.deb
DEBIAN_FRONTEND=noninteractive dpkg -i mysql-apt-config*
rm mysql-apt-config*
# update, upgrade and install MySQL dependencies
apt update && apt install -y nodejs mysql-server mysql-shell mysql-router

# build MySQL configuration script
rm -f configure-mysql.js
if test "$ISCLUSTER" = "y"; then
  cat <<EOF >>configure-mysql.js
print('\n');
print('  MySQL InnoDB Cluster Configuration\n');
print('  ==================================\n\n');
print('  - create cluster admin user; icadmin\n');
print('    *NOTE: icadmin must have the same password on all instances');
print('  - configure/create cluster; InnoDBCluster\n');
print('  - create database; mochimo\n');
print('  - create balance delta table; mochimo.balance\n');
print('  - create blockchain data table; mochimo.block\n');
print('  - create richlist leaderboard table; mochimo.richlist\n');
print('  - create transaction data table; mochimo.transaction\n');
print('  - create application user; mochimo\n');
print('  - restrict permissions for mochimo user\n\n');

function getPassword (msg) {
  return shell.prompt(msg, { type: 'password' });
}

let clusterAdminPassword, confirmPassword, password;
const clusterAdmin = "'icadmin'@'%'";
const interactive = false;
const restart = true;

do {
  password = getPassword(
    "Please provide the password for 'root@localhost': ");
  try {
    shell.connect({ user: 'root', password, host: 'localhost' });
  } catch (error) {
    print(error.message + '\n\n');
  }
} while (!shell.getSession());
print('Shell connected successfully\n\n');

do {
  clusterAdminPassword = getPassword(
    "Please provide a password for 'icadmin@localhost': ");
  confirmPassword = getPassword(
    "Please confirm the password for 'icadmin@localhost': ");
  if (clusterAdminPassword !== confirmPassword) {
    print('Passwords do not match.\n\n');
  }
} while (!clusterAdminPassword || clusterAdminPassword !== confirmPassword);
print('Password accepted\n\n');

dba.configureInstance('root@localhost:3306', {
  clusterAdmin, clusterAdminPassword, password, interactive, restart
});

EOF
  if test "$ISPRIMARY" = "y"; then
    cat <<EOF >>configure-mysql.js
dba.createCluster('InnoDBCluster');

EOF
  else
    cat <<EOF >>configure-mysql.js
cluster.addInstance('icadmin@$PRIMARYIP:3306', {
  password: clusterAdminPassword, interactive
});

EOF
  fi
else
  cat <<EOF >>configure-mysql.js
print('\n');
print('  MySQL Database Configuration\n');
print('  ============================\n\n');
print("  - create admin user; 'admin'@'localhost'\n");
print('  - create database; mochimo\n');
print('  - create balance delta table; mochimo.balance\n');
print('  - create blockchain data table; mochimo.block\n');
print('  - create richlist leaderboard table; mochimo.richlist\n');
print('  - create transaction data table; mochimo.transaction\n');
print("  - create application user; 'mochimo'@'localhost'\n");
print('  - restrict permissions for mochimo user\n\n');

function getPassword (msg) {
  return shell.prompt(msg, { type: 'password' });
}

let confirmPassword, password;

do {
  password = getPassword(
    "Please provide the password for 'root@localhost': ");
  try {
    shell.connect({ user: 'root', password, host: 'localhost' });
  } catch (error) {
    print(error.message + '\n\n');
  }
} while (!shell.getSession());
print('Shell connected successfully\n\n');

EOF
fi

if test ! "$ISCLUSTER" = "y" || test "$ISPRIMARY" = "y"; then
  cat <<EOF >>configure-mysql.js
shell.getSession().runSql('CREATE DATABASE \`mochimo\`');
shell.getSession().runSql('use \`mochimo\`');
shell.getSession().runSql(
  'CREATE TABLE \`balance\` (' +
    '\`created\` DATETIME NOT NULL, ' +
    '\`bnum\` CHAR(64) NOT NULL, ' +
    '\`bhash\` CHAR(64) NOT NULL, ' +
    '\`address\` CHAR(64) NOT NULL, ' +
    '\`addressHash\` CHAR(64) NOT NULL, ' +
    '\`tag\` CHAR(24) NOT NULL, ' +
    '\`balance\` BIGINT UNSIGNED NOT NULL, ' +
    '\`delta\` BIGINT NOT NULL, ' +
    'PRIMARY KEY (\`bnum\`, \`bhash\`, \`addressHash\`), ' +
    'INDEX idx_tag(\`tag\`), ' +
    'INDEX idx_balance(\`balance\`)' +
  ')'
);
shell.getSession().runSql(
  'CREATE TABLE \`block\` (' +
    '\`created\` DATETIME NOT NULL, ' +
    '\`started\` DATETIME NOT NULL, ' +
    '\`type\` VARCHAR(12) NOT NULL, ' +
    '\`size\` BIGINT UNSIGNED NOT NULL, ' +
    '\`difficulty\` INT UNSIGNED NOT NULL, ' +
    '\`bnum\` BIGINT UNSIGNED NOT NULL, ' +
    '\`bhash\` CHAR(64) NOT NULL, ' +
    '\`phash\` CHAR(64) NOT NULL, ' +
    '\`mroot\` CHAR(64), ' +
    '\`nonce\` CHAR(64), ' +
    '\`maddr\` CHAR(64), ' +
    '\`mreward\` BIGINT UNSIGNED, ' +
    '\`mfee\` BIGINT UNSIGNED, ' +
    '\`amount\` BIGINT UNSIGNED, ' +
    '\`tcount\` BIGINT UNSIGNED, ' +
    '\`lcount\` BIGINT UNSIGNED, ' +
    'PRIMARY KEY (\`bnum\`, \`bhash\`), ' +
    'INDEX idx_created(\`created\`), ' +
    'INDEX idx_started(\`started\`) ' +
  ')'
);
shell.getSession().runSql(
  'CREATE TABLE \`richlist\` (' +
    '\`address\` CHAR(64) NOT NULL, ' +
    '\`addressHash\` CHAR(64) NOT NULL, ' +
    '\`tag\` CHAR(24) NOT NULL, ' +
    '\`balance\` BIGINT UNSIGNED NOT NULL, ' +
    '\`rank\` BIGINT UNSIGNED NOT NULL PRIMARY KEY ' +
  ')'
);
shell.getSession().runSql(
  'CREATE TABLE \`transaction\` (' +
    '\`created\` DATETIME NOT NULL DEFAULT (UTC_TIMESTAMP), ' +
    '\`confirmed\` DATETIME, ' +
    '\`bnum\` BIGINT UNSIGNED, ' +
    '\`bhash\` CHAR(64), ' +
    '\`txid\` CHAR(64) NOT NULL, ' +
    '\`txsig\` CHAR(64) NOT NULL, ' +
    '\`srcaddr\` CHAR(64) NOT NULL, ' +
    '\`srctag\` CHAR(24) NOT NULL, ' +
    '\`dstaddr\` CHAR(64) NOT NULL, ' +
    '\`dsttag\` CHAR(24) NOT NULL, ' +
    '\`chgaddr\` CHAR(64) NOT NULL, ' +
    '\`chgtag\` CHAR(24) NOT NULL, ' +
    '\`sendtotal\` BIGINT UNSIGNED NOT NULL, ' +
    '\`changetotal\` BIGINT UNSIGNED NOT NULL, ' +
    '\`txfee\` BIGINT UNSIGNED NOT NULL, ' +
    'PRIMARY KEY (\`txid\`, \`txsig\`), ' +
    'INDEX idx_created(\`created\`), ' +
    'INDEX idx_bnum(\`bnum\`), ' +
    'INDEX idx_srctag(\`srctag\`), ' +
    'INDEX idx_dsttag(\`dsttag\`), ' +
    'INDEX idx_chgtag(\`chgtag\`)' +
  ')'
);

do {
  password = getPassword(
    "Please provide a password for 'mochimo@localhost': ");
  confirmPassword = getPassword(
    "Please confirm the password for 'mochimo@localhost': ");
  if (password !== confirmPassword) {
    print('Passwords do not match.\n\n');
  }
} while (!password || password !== confirmPassword);
print('Password accepted\n\n');

shell.getSession().runSql(
  "CREATE USER 'mochimo'@'%' IDENTIFIED by '" + password + "'");
shell.getSession().runSql(
  "GRANT INSERT, SELECT, UPDATE ON mochimo.* TO 'mochimo'@'%'");
shell.getSession().runSql(
  "GRANT DELETE ON mochimo.richlist TO 'mochimo'@'%'");
shell.getSession().runSql(
  'FLUSH PRIVILEGES');

EOF
fi

# configure MySQL
mysql_secure_installation
mysqlsh -f configure-mysql.js
# remove configuration script
rm configure-mysql.js
if test "$ISCLUSTER" = "y"; then
  echo
  echo "  Mysql Router Configuration"
  echo "  =========================="
  echo
  if test "$ISPRIMARY" = "y"; then
    mysqlrouter --user root --bootstrap icadmin@localhost:3306 \
      --conf-use-sockets --account icrouter --account-create always
  else
    mysqlrouter --user root --bootstrap icadmin@localhost:3306 \
      --conf-use-sockets --account icrouter
  fi
  # install mysqlrouter service
  cat <<EOF >/etc/systemd/system/mysqlrouter.service
[Unit]
Description=MySql Application Router
After=network.target
[Service]
ExecStart=mysqlrouter
[Install]
WantedBy=multi-user.target

EOF
  systemctl daemon-reload
  systemctl enable mysqlrouter.service
  systemctl restart mysqlrouter.service
fi

# install Mochimo API components, dependencies and .env..."
git clone --single-branch \
  https://github.com/adequatesystems/mochimo-api-nodejs ~/mochimo-api-nodejs
cd ~/mochimo-api-nodejs && rm -f .env
echo
read -p "Please provide the password for 'mochimo@localhost': " DBPASS
echo
echo "DBPASS=$DBPASS" >> .env
if test "$ISCLUSTER" = "y"; then
  echo "DBPORT_RW=6446" >> .env
  echo "DBPORT_RO=6447" >> .env
fi
if test ! -z "$IPINFOTOKEN"; then echo "IPINFOTOKEN=$IPINFOTOKEN" >> .env; fi
npm install && npm run pm2setup && npm run pm2startup

# COMPLETE, final notes
THISIP=$(hostname -I | awk '{print $1;}')
echo
echo "  The Mochimo API should now be ready!"
echo
echo "  Try connecting with:"
echo "    http://$THISIP/block/"
echo "    http://$THISIP/transaction/"
echo
echo "  To launch the API on a secure port (https)..."
echo "  place your ssl certificate in /etc/ssl/certs/"
echo "  and your ssl private key in /etc/ssl/private/"
echo "  ... then add these files to the '.env' file:"
echo "    echo 'SSLCERT=/etc/ssl/certs/mochimo-api.pem' >> .env"
echo "    echo 'SSLKEY=/etc/ssl/private/mochimo-api.key' >> .env"
echo "  ... and restart the API with: npm restart"

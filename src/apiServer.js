#!/usr/bin/env node
/**
 *  apiServer.js; Mochimo Cryptocurrency Network API (primarily) for MochiMap
 *  Copyright (C) 2021  Chrisdigity
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Affero General Public License as published
 *  by the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Affero General Public License for more details.
 *
 *  You should have received a copy of the GNU Affero General Public License
 *  along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 */

console.log('\n// START:', __filename);

/* environment variables */
require('dotenv').config();

/* modules and utilities */
const fs = require('fs');
const http = require('http');
const https = require('https');
const { informedShutdown } = require('./apiUtils');
const Router = require('./apiRouter');

/* server */
const Server = {
  _api: null,
  _connections: new Set(),
  _sockets: new Set(),
  broadcast: (type, event, data) => { /* noop until websockets */ },
  init: () => new Promise((resolve, reject) => {
    const fid = 'Server.start():';
    console.log(fid, 'creating new http/s server...');
    try {
      // create http/s server
      Server._api = process.env.DEVELOPMENT
        ? http.createServer() // insecure development server
        : https.createServer({ // secure production server
          key: fs.readFileSync('/etc/ssl/private/mochimap.com.key'),
          cert: fs.readFileSync('/etc/ssl/certs/mochimap.com.pem')
        });
      // set http server events
      Server._api.on('request', Router);
      Server._api.on('error', reject);
      Server._api.on('connect', (res, socket/* , head */) => {
        Server._connections.add(socket); // track connections
        socket.on('end', () => Server._apiConnections.delete(socket));
      });
      Server._api.on('listening', () => {
        const { address, port } = Server._api.address();
        console.log(fid, `${address}:${port} ready`);
        resolve();
      });
      // start http server
      Server._api.listen(process.env.DEVELOPMENT ? 80 : 443, '0.0.0.0');
    } catch (error) {
      console.error('An ERROR occurred during server initialization;', error);
    }
  })
};

/* cleanup */
const cleanup = (e, src) => {
  // end server (removing connections) and/or exit
  if (Server._api) {
    console.log('// CLEANUP: initiating server shutdown...');
    Server._api.close().then(() => informedShutdown(e, src));
    console.log('// CLEANUP: disconnecting current connection requests...');
    Server._apiConnections.forEach(socket => socket.destroy());
  } else return informedShutdown(e, src);
};
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('uncaughtException', console.trace);

/* startup */
console.log('Begin startup...');
// start api server and begin network scanning
Server.init();

#!/usr/bin/env node
/**
 *  netScanner.js; Mochimo Network scanner for MochiMap
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

/* region check */
if (typeof process.env.REGION === 'undefined') {
  console.warn('// WARNING: region is undefined');
  console.warn('// network region data will not be recorded...');
}

/* ipinfo token check
if (typeof process.env.IPINFOTOKEN === 'undefined') {
  console.warn('// WARNING: ipinfo token is undefined');
  console.warn('// host data will not be recorded...');
} */

/* global BigInt */
/* eslint no-extend-native: ["error", { "exceptions": ["BigInt"] }] */
BigInt.prototype.toJSON = function () { return this.toString(); };

const fs = require('fs');
const fsp = fs.promises;
const { isIPv4 } = require('net');
const {
  informedShutdown,
  isPrivateIPv4,
  ms,
  readWeb
} = require('./apiUtils');
const Db = require('./apiDatabase');
const Mochimo = require('mochimo');

const REGION = process.env.REGION || undefined;
const STARTLIST = [
  'https://www.mochimap.com/startnodes.lst',
  'https://www.mochimap.net/startnodes.lst',
  'https://mochimo.org/startnodes.lst',
  process.env.STARTLIST
];

const Scanner = {
  _cache: new Map(),
  _recent: new Set(),
  _scanning: new Set(),
  _timeidle: 0,
  _timeinterval: ms.second,
  _timeout: undefined,
  init: async () => {
    console.log('// INIT: begin network scanner initialization...');
    for (const source of STARTLIST) {
      if (!source) return;
      try { // download and decipher data from source
        let data = source.startsWith('http')
          ? await readWeb(source) : await fsp.readFile(source, 'utf8');
        if (typeof data === 'string') {
          data = (data.match(/(^|(?<=\n))[\w.]+/g) || []);
          data = data.filter(ip => isIPv4(ip) && !isPrivateIPv4(ip));
          if (data.length) {
            const sizeBefore = Scanner._recent.size;
            for (const ip of data) Scanner._recent.add(ip);
            const sizeDiff = Scanner._recent.size - sizeBefore;
            console.log(source, 'added', sizeDiff, 'peers to recent');
          } else console.log(source, 'contained no valid peers...');
        } else console.log(source, 'contained no data...');
      } catch (error) { console.error(source, error); }
    }
  },
  run: async () => {
    // rebuild current (global) peerlist from active and associated peers
    const current = new Set();
    Scanner._cache.forEach((node, ip) => {
      if (node.status === Mochimo.VEOK) {
        // add node host ip and peerlist ip's
        current.add(node.host.ip);
        node.peers.forEach((peer) => {
          // ignore private IP addresses
          if (!isPrivateIPv4(peer)) current.add(peer);
        });
      }
    });
    // remove stale nodes from cache
    const staleOffset = Date.now() - (ms.day * 3); // calc stale offset
    Scanner._cache.forEach((node, ip) => {
      // check node for inactivity (!VEOK), drop from cache if stale
      /// - must NOT be included in current (global) peerlist
      /// - must NOT have lastVEOK timestamp within last 3 days
      if (node.status !== Mochimo.VEOK) {
        if (!current.has(ip) && node.lastVEOK < staleOffset) {
          Scanner._cache.delete(ip);
        }
      }
    });
    // check for network communication loss
    if (!current.size && !Scanner._timeidle) {
      console.log('// NETWORK: communication loss detected!');
      console.log('// performing network scan on ALL recorded peers...');
      Scanner._timeidle = Date.now(); // record timestamp of communication loss
      Scanner._recent.forEach(Scanner.scan);
    } else if (current.size) { // assume network ok
      Scanner._timeidle = 0;
      current.forEach(Scanner.scan);
    } else { // assume ongoing network communications loss
      const now = Date.now();
      const idleTime = now - Scanner._timeidle;
      const idleOffset = now - (ms.second * 30); // calc idle offset
      if (idleTime > idleOffset) {
        console.log('// NETWORK: ongoing communication loss exceeded limit!');
        console.log('// performing network re-initialization...');
        Scanner._timeidle = 0; // reset idle time
        await Scanner.init();
      }
    }
    // queue next Scanner.run()
    Scanner._timeout = setTimeout(Scanner.run, Scanner._timeinterval);
  },
  scan: async (ip) => {
    // add ip to _scanning, or bail to avoid overlapping requests
    if (Scanner._scanning.has(ip)) return; else Scanner._scanning.add(ip);
    // obtain relative offsets and previous node state
    const updateOffset = Date.now() - (ms.second * 30); // calc update offset
    const cachedNode = Scanner._cache.get(ip);
    // check for outdated node state
    if (!cachedNode || cachedNode.timestamp < updateOffset) {
      // build node options and perform peerlist request for latest state
      const nodeOptions = { ip, opcode: Mochimo.OP_GETIPL };
      let node = await Mochimo.Node.callserver(nodeOptions);
      // add available peers to _recent
      const { peers } = node;
      const sizeBefore = Scanner._recent.size;
      if (Array.isArray(peers)) peers.forEach((ip) => Scanner._recent.add(ip));
      const sizeDiff = Scanner._recent.size - sizeBefore;
      if (sizeDiff) console.log(ip, 'added', sizeDiff, 'peers to _recent');
      // obtain latest timestamp from node and determine uptimestamp
      const { timestamp } = node;
      let lastVEOK;
      let uptimestamp = (cachedNode && cachedNode.uptimestamp) || timestamp;
      if (node.status === Mochimo.VEOK) {
        if (uptimestamp < 0) uptimestamp = timestamp;
        lastVEOK = timestamp;
      } else uptimestamp = -1;
      // convert node to JSON output and prepend uptimestamp
      node = Object.assign({ lastVEOK, uptimestamp }, node.toJSON());
      // update local cache
      Scanner._cache.set(ip, Object.assign(cachedNode || {}, node));
      // move connection stats to node.connection[region] object (prepended)
      if (REGION) {
        const connection = {};
        const { status, ping, baud } = node;
        connection[REGION] = { status, ping, baud, timestamp, uptimestamp };
        node = Object.assign(connection, node);
      }
      delete node.lastVEOK; // not included in database
      delete node.uptimestamp;
      delete node.timestamp;
      delete node.status;
      delete node.ping;
      delete node.baud;
      // move host stats to node.host object (prepended)
      const { port } = node;
      node = Object.assign({ host: { ip, port } }, node);
      delete node.port;
      delete node.ip;
      // add _id, filter BigInt and update database with state of node
      const _id = Db.util.id.network(ip);
      node = Object.assign({ _id }, Db.util.filterBigInt(node));
      if (await Db.has('network', ip)) {
        const insert = await Db.update('network', node, { _id });
        console.log(ip, 'insert', (insert ? '' : 'not ') + 'acccepted...');
      } else {
        const update = await Db.insert('network', node);
        console.log(ip, 'update', (update ? '' : 'not ') + 'acccepted...');
      }
      /* check for outdated host data on cached state
      // const hostOffset = now - ms.week; // calc host offset
      if (!cachedNode || cachedNode.host.timestamp < hostOffset) {
        if (process.env.IPINFOTOKEN) {
          // build host data request source
          let hostSource = 'https://ipinfo.io/' + ip;
          hostSource += '/json?token=' + process.env.IPINFOTOKEN;
          const host = await readWeb(hostSource);
          if (typeof host === 'object') {
            delete host.ip; // not needed
            Object.assign(host, { timestamp: Date.now() });
            Object.assign(node, { host }); // apply host data to node
          } else console.error('// ERROR: data was not json', hostSource);
        }
      } */
    }
    // remove ip from lock-list
    Scanner._scanning.delete(ip);
  }
};

/* set cleanup signal traps */
const cleanup = (e, src) => {
  if (Scanner._timeout) {
    console.log('// CLEANUP: terminating watcher timeout...');
    clearTimeout(Scanner._timeout);
  }
  return informedShutdown(e, src);
};
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('uncaughtException', console.trace);

/* initialize watcher */
Scanner.init().then(Scanner.run);

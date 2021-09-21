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

/* ipinfo token check */
if (typeof process.env.IPINFO === 'undefined') {
  console.warn('// WARNING: ipinfo token is undefined');
  console.warn('// host data will not be recorded...');
}

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

const IPINFOQuery = '/json?token=' + process.env.IPINFO;
const REGION = process.env.REGION || undefined;
const STARTLIST = [
  'https://www.mochimap.com/startnodes.lst',
  'https://www.mochimap.net/startnodes.lst',
  'https://mochimo.org/startnodes.lst',
  process.env.STARTLIST
];
const INTERVAL = {
  host: ms.week, // time between IPINFO host information requests
  idle: ms.second * 60, // allowable network communications loss
  monitor: ms.second * 337.5, // target Mochimo block time
  run: ms.second,
  stale: ms.day * 3,
  update: ms.second * 30
};

const Scanner = {
  _cache: new Map(),
  _recent: new Set(),
  _scanning: new Set(),
  _timeidle: undefined,
  _timemonitor: Date.now(),
  _timeout: undefined,
  init: async () => {
    console.log('// INIT: network scanner...');
    for (const source of STARTLIST) {
      if (!source) return;
      try { // download and decipher data from source
        const sizeBefore = Scanner._recent.size;
        let data = source.startsWith('http')
          ? await readWeb(source)
          : await fsp.readFile(source, 'utf8');
        if (typeof data === 'string') {
          data = (data.match(/(^|(?<=\n))[\w.]+/g) || []);
          data = data.filter(ip => isIPv4(ip) && !isPrivateIPv4(ip));
          if (data.length) for (const ip of data) Scanner._recent.add(ip);
        }
        const sizeDiff = Scanner._recent.size - sizeBefore;
        console.log(source, `(${sizeDiff})`);
      } catch (error) { console.error(source, error); }
    }
  },
  run: () => {
    const now = Date.now();
    // queue next Scanner.run() to execute approx. every second
    Scanner._timeout = setTimeout(Scanner.run, INTERVAL.run);
    // rebuild current (global) peerlist from active and associated peers
    const current = new Set();
    Scanner._cache.forEach((node, ip) => {
      if (node.status === Mochimo.VEOK) {
        // add node host ip and peerlist ip's
        current.add(ip);
        node.peers.forEach((peer) => {
          // ignore private IP addresses
          if (!isPrivateIPv4(peer)) {
            Scanner._recent.add(peer);
            current.add(peer);
          }
        });
      }
    });
    // remove stale nodes from cache
    const staleOffset = Date.now() - INTERVAL.stale; // calc stale offset
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
      console.log('// performing scan on "recent" peers...');
      Scanner._timeidle = Date.now(); // record timestamp of communication loss
      Scanner._recent.forEach(Scanner.scan);
    } else if (current.size) { // assume network ok
      Scanner._timeidle = undefined;
      current.forEach(Scanner.scan);
    } else { // assume ongoing network communications loss
      const idleTime = now - Scanner._timeidle;
      const idleOffset = now - INTERVAL.idle; // calc idle offset
      if (idleTime > idleOffset) {
        console.log('// NETWORK: ongoing communication loss!');
        console.log('// performing network re-initialization...');
        Scanner._timeidle = 0; // reset idle time
        Scanner.init(); // asynchronous
      }
    }
    // check for monitor update
    const monitorOffset = now - INTERVAL.monitor; // calc monitor offset
    if (Scanner._timemonitor < monitorOffset) {
      Scanner._timemonitor = now;
      console.log('Network State;',
        Scanner._recent.size, 'recent,', current.size, 'current...');
    }
  },
  scan: async (ip) => {
    // add ip to _scanning, or bail to avoid overlapping requests
    if (Scanner._scanning.has(ip)) return; else Scanner._scanning.add(ip);
    // obtain relative offsets and previous node state
    const now = Date.now();
    const updateOffset = now - INTERVAL.update; // calc update offset
    const hostOffset = now - INTERVAL.host; // calc host offset
    const cachedNode = Scanner._cache.get(ip) || {};
    // check for outdated node state
    if (!cachedNode.timestamp || cachedNode.timestamp < updateOffset) {
      // build node options and perform peerlist request for latest state
      const nodeOptions = { ip, opcode: Mochimo.OP_GETIPL };
      let node = await Mochimo.Node.callserver(nodeOptions);
      // merge node results with cachedNode state
      node = { ...cachedNode, ...node.toJSON() };
      // update node uptimestamp and lastVEOK
      if (!node.uptimestamp) node.uptimestamp = -1;
      if (!node.lastVEOK) node.lastVEOK = -1;
      if (node.status === Mochimo.VEOK) {
        if (node.uptimestamp < 0) node.uptimestamp = node.timestamp;
        node.lastVEOK = node.timestamp;
      } else node.uptimestamp = -1;
      // check for outdated host data on cached state
      if (process.env.IPINFO) { // ... only if IPINFO token available
        if (!node.host) node.host = { timestamp: -1 };
        if (node.host.timestamp < hostOffset) {
          // build host data request source
          const host = await readWeb('https://ipinfo.io/' + ip + IPINFOQuery);
          // apply host data to node or report error with host data
          if (typeof host === 'object') {
            node.host = { port: node.port, ...host, timestamp: now };
          } else console.error('// ERROR: data from IPINFO was not json');
        }
      }
      // update local cache with Object clone
      Scanner._cache.set(ip, { ...node }); // note; node.host is referenced
      // move connection stats to node.connection[region] object (prepended)
      if (REGION) {
        const { status, ping, baud, timestamp, uptimestamp } = node;
        const conn = { status, ping, baud, timestamp, uptimestamp };
        // place connection parameter after host parameter
        node = { host: node.host, [`connection.${REGION}`]: conn, ...node };
      }
      // remove erroneous parameters before database update
      delete node.lastVEOK; // not included in database
      delete node.uptimestamp;
      delete node.timestamp;
      delete node.status;
      delete node.ping;
      delete node.baud;
      delete node.port;
      delete node.ip;
      // add _id and filter BigInt
      const _id = Db.util.id.network(ip);
      node = { _id, ...Db.util.filterBigInt(node) };
      try { // add atomimc operator $set and asynchronously update database
        Db.update('network', { $set: node }, { _id }, { upsert: true });
      } catch (error) { console.log(ip, 'database error;', error); }
    }
    // remove ip from lock-list
    Scanner._scanning.delete(ip);
  }
};

/* set cleanup signal traps */
const cleanup = (e, src) => {
  if (Scanner._timeout) {
    console.log('// CLEANUP: terminating scanner timeout...');
    clearTimeout(Scanner._timeout);
  }
  return informedShutdown(e, src);
};
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('uncaughtException', console.trace);

/* initialize watcher */
Scanner.init().then(Scanner.run);

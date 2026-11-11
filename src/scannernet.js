/**
 *  netscanner.js; Mochimo Network scanner for MochiMap
 *  Copyright (C) 2021-2022  Chrisdigity
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

/* constants */
const MS7DAY = 7 * 24 * 60 * 60 * 1000;
const MS3DAY = 3 * 24 * 60 * 60 * 1000;
const MS30SECOND = 30 * 1000;

/* modules and utilities */
const { IPinfoWrapper, LruCache } = require('node-ipinfo');
const Mochimo = require('mochimo');
const Lru = require('lru-cache');

/* environment initialization */
require('dotenv').config();
const MAXIPNUM = process.env.MAXIPNUM || 5000;
const MAXIPAGE = process.env.MAXIPAGE || MS7DAY;
const MAXNODEAGE = process.env.MAXNODEAGE || MS3DAY;
const MAXSCAN = process.env.MAXSCAN || 128;
const IPINFOTOKEN = process.env.IPINFOTOKEN;
const NODEIP = process.env.NODEIP || '127.0.0.1';

/* ipinfo initialization */
const ipinfoCache = new LruCache({ max: MAXIPNUM, maxAge: MAXIPAGE });
const ipinfo = new IPinfoWrapper(IPINFOTOKEN, ipinfoCache);

/* Network Scanner class */
module.exports =
class NetworkScanner {
  constructor ({ emit }) {
    /* environment check */
    if (IPINFOTOKEN === 'undefined') {
      console.warn(this.name, '//', 'missing IPINFOTOKEN');
      console.warn(this.name, '//', 'IP info will not be available');
    }
    // apply instance parameters
    const idle = undefined;
    Object.assign(this, {
      cache: new Lru({ max: MAXIPNUM, maxAge: MAXNODEAGE }),
      ...{ emit, idle, name: 'NETSCANNER', scanning: new Set() }
    });
    // begin network scan (asynchronous)
    this.init();
    this.run();
  }

  cleanup () {
    if (this._timeout) {
      console.log(this.name, '//', 'clearing timeout...');
      clearTimeout(this._timeout);
      this._timeout = undefined;
    }
  }

  getPeers (matchParams = {}) {
    return this.cache.dump().reduce((acc, cur) => {
      for (const param in matchParams) {
        if (param in cur.v && cur.v[param] !== matchParams[param]) {
          return acc;
        }
      }
      acc.push(cur.v);
      return acc;
    }, []);
  }

  init () {
    if (this.cache.size) {
      console.log(this.name, '//', '(re)scan network cache...');
    } else console.log(this.name, '//', 'begin network scan...');
    // scan NODEIP and any cache
    this.scan(NODEIP);
    this.cache.keys().forEach(this.scan.bind(this));
  }

  run () {
    // queue next this.run() to execute approx. every second
    setTimeout(this.run.bind(this), 1000);
    // init run
    let netVEOK = 0;
    const now = Date.now();
    // (re)scan VEOK nodes and their respective peerlist
    this.cache.keys().forEach((ip) => {
      const node = this.cache.peek(ip);
      if (node && node.status === Mochimo.VEOK) {
        // assume network is OK
        netVEOK++;
        if (this.idle) {
          console.warn(this.name, '//', 'communication restored!');
          this.idle = undefined;
        }
        // check rescan
        this.scan(ip);
        if (Array.isArray(node.peers)) {
          node.peers.forEach(this.scan.bind(this));
        }
      }
    });
    // check network status
    if (!netVEOK) {
      // check idle timer
      if (!this.idle) {
        console.warn(this.name, '//', 'communication loss detected!');
        // record timestamp of communication loss
        this.idle = Date.now();
      } else {
        // assume ongoing network communications loss
        const idleTime = now - this.idle;
        if (idleTime > MS30SECOND) {
          this.idle = Date.now(); // reset idle time
          console.error(this.name, '//', 'extended communication loss!');
          console.error(this.name, '//', 'perform re-initialization...');
          this.init();
        }
      }
    }
  }

  scan (ip) {
    // avoid duplicate scans
    if (this.scanning.has(ip)) return;
    // add 1 second delay scans exceeding maximum
    if (this.scanning.size >= MAXSCAN) {
      return setTimeout(this.scan.bind(this, ip), 1000);
    }
    // register asynchronous scan
    this.scanning.add(ip);
    this.scanNode(ip).catch((error) => {
      console.trace(this.name, '// SCAN', error);
    }).finally(() => this.scanning.delete(ip));
  }

  async scanNode (ip) {
    // obtain time and cached node state (if any)
    const now = Date.now();
    const cached = this.cache.get(ip) || { timestamp: 0, uptimestamp: 0 };
    // check for outdated node state
    if (!cached.timestamp || cached.timestamp < (now - MS30SECOND)) {
      // build node options and perform peerlist request for latest state
      const nodeOptions = { ip, opcode: Mochimo.OP_GETIPL };
      let node = (await Mochimo.Node.callserver(nodeOptions)).toJSON();
      // if node is VEOK refresh uptimestamp...
      if (node.status === Mochimo.VEOK) {
        if (!cached.uptimestamp) node.uptimestamp = node.timestamp;
        if (IPINFOTOKEN) {
          try { // ... and obtain IP info data
            const info = await ipinfo.lookupIp(ip);
            if (info.error) throw info.error;
            node = { ...info, ...node };
          } catch (error) {
            console.trace(this.name, '// IPINFO', error);
          }
        }
      } else node.uptimestamp = 0;
      // update cached node object
      Object.assign(cached, node);
      // if VEOK and not in cache...
      if (cached.status === Mochimo.VEOK && !this.cache.has(ip)) {
        // ... add node to cache, and
        if (!NetworkScanner.isPrivateIPv4(ip)) this.cache.set(ip, cached);
        // ... extend scan to peers of valid node
        if (Array.isArray(cached.peers)) {
          cached.peers.forEach(this.scan.bind(this));
        }
      }
      // emit update to streams
      if (typeof this.emit === 'function') {
        this.emit(cached, 'network');
      }
    }
  }

  static isPrivateIPv4 (ip) {
    const b = new ArrayBuffer(4);
    const c = new Uint8Array(b);
    const dv = new DataView(b);
    if (typeof ip === 'number') dv.setUint32(0, ip, true);
    if (typeof ip === 'string') {
      const a = ip.split('.');
      for (let i = 0; i < 4; i++) dv.setUint8(i, a[i]);
    }
    if (c[0] === 0 || c[0] === 127 || c[0] === 10) return 1; // class A
    if (c[0] === 172 && c[1] >= 16 && c[1] <= 31) return 2; // class
    if (c[0] === 192 && c[1] === 168) return 3; // class C
    if (c[0] === 169 && c[1] === 254) return 4; // auto
    return 0; // public IP
  }
};

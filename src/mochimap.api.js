#!/usr/bin/env node
/**
 *  MochiMap   Realtime network analysis for the Mochimo Cryptocurrency Network
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

require('dotenv').config();

/* global BigInt */
/* eslint no-extend-native: ["error", { "exceptions": ["BigInt"] }] */
BigInt.prototype.toJSON = function () { return this.toString(); };
const LowerCase = (str) => str.toLowerCase();
const NotEmpty = (val) => val;

// const crypto = require('crypto');
const { isIPv4 } = require('net');
const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const {
  isPrivateIPv4,
  objectDifference,
  objectIsEmpty,
  readWeb,
  visualizeHaiku
} = require('./mochimap.util');
const Mongo = require('./mochimap.mongo');
const Mochimo = require('mochimo');

/* pre-core */
// const GENESIS_HASH =
//   '00170c6711b9dc3ca746c46cc281bc69e303dfad2f333ba397ba061eccefde03';
const SET_LIMIT = 0xfff;
const DATADIR = path.join('.', 'data');
const BCDIR = path.join(DATADIR, 'bc');
const BASEURL = 'https://api.mochimap.com/';
const CUSTOMNODE = process.env.CUSTOM_NODE;

const Network = {
  block: {
    _cache: new Set(), // TODO: switch to using _chain
    _chain: new Map(),
    check: async (ip, bnum, bhash) => {
      const fid = 'Network.block.check():';
      if (typeof ip === 'object') {
        bhash = ip.cblockhash;
        bnum = ip.cblock;
        ip = ip.ip;
      }
      if (bnum === 0n) return; // disregard B.O.D. checks
      if (!Network.block._cache.has(bhash)) {
        // download tfile entries and validate against _chain
        // add validated tfile entries to _chain
        // download block data
        // validate hashes???
        // update database
        // ... dumb for now ...
        Network.block._cache.add(bhash);
        if (Network.block._cache.size > SET_LIMIT) {
          Network.block._cache.delete(Network.block._cache.values().next().value);
        }
        // check database has received block update
        const hasBlock = await Mongo.has.block(bnum, bhash);
        if (!hasBlock) {
          // download/verify block is as advertised
          const block = await Mochimo.getBlock(ip, bnum);
          if (block.bnum !== bnum) {
            console.error(fid, `Downloaded ${bnum} from ${ip}, got ${bnum}`);
          } else if (block.bhash !== bhash) {
            console.error(fid, `Downloaded ${bnum}/${bhash.slice(0, 8)}~ from`,
              ip, `got ${block.bnum}/${block.bhash.slice(0, 8)}~`);
          } else if (block.type === Mochimo.Block.INVALID) {
            console.error(fid, `Downloaded ${bnum}/${bhash.slice(0, 8)}~ from`,
              ip, 'got invalid block type');
          } else { // initiate asynchronous "checkback" and block update
            const phash = block.phash;
            const pbnum = block.bnum - 1n;
            Network.block.check(ip, pbnum, phash).catch(console.trace);
            Network.block.update(block).then(Network.block.visualize)
              .catch(console.trace);
          }
        }
      }
    },
    update: async (block) => {
      const fid = 'Network.block.update():';
      // minify block and send to Server interface for asynchronous broadcast
      const blockJSON = block.toJSON(true);
      Server.broadcast('blockUpdates', 'block', blockJSON);
      // store raw block on local disk (no overwrite, excl. neogenesis blocks)
      const bhash = block.bhash;
      const bnum = block.bnum;
      if (bnum & 0xff) {
        try {
          const fname = Mongo._id.block(bnum, bhash).replace('-', '.') + '.bc';
          const fpath = path.join(BCDIR, fname);
          await fsp.mkdir(BCDIR, { recursive: true });
          await fsp.writeFile(fpath, Buffer.from(block.buffer), { flag: 'wx' });
        } catch (error) {
          console.error(fid, `failed to write raw block to ${path};`, error);
        }
      }
      // send block update to Mongo interface for processing
      await Mongo.process.blockUpdate(block);
      // send block data to visualizer for asynchronous haiku visualization
      Network.block.visualizer(blockJSON).catch(console.trace);
      // return block for promise chaining
      return block;
    },
    visualizer: async (hBlock) => {
      const bhash = hBlock.bhash;
      const bnum = hBlock.bnum;
      // find appropriate block to use for haiku visualization
      let checkback = 0;
      let shadow = 0;
      while (hBlock.type !== 'normal' || checkback > 0) {
        shadow |= checkback;
        if (hBlock.type === 'normal') checkback--; // decrease checkback
        else {
          shadow |= ++checkback; // increase checkback and trigger shadow haiku
          // check for previous block data
          const pbnum = BigInt(hBlock.bnum) - 1n;
          // get previous block data (if available) and start over
          hBlock = await Mongo.get.blockById(pbnum, hBlock.bhash);
          if (hBlock) continue;
          break;
        }
      }
      // visualize Haiku from appropriate block data
      if (hBlock) {
        shadow = Boolean(shadow);
        const haiku = Mochimo.Trigg.expand(hBlock.nonce, shadow);
        const visual = await visualizeHaiku(haiku, shadow);
        // send haiku to Server interface for asynchronous broadcast
        Server.broadcast('haikuUpdates', 'haiku', visual);
        // send haiku to Mongo interface for asynchronous database update
        await Mongo.update.blockById(visual, bnum, bhash);
      } else console.warn(`cannot visualize bnum ${bnum} at this time...`);
    }
  },
  node: {
    _idle: 0,
    _intervalScan: 1000,
    _intervalScanFailure: 60000,
    _intervalUpdate: 20000,
    _list: new Map(),
    _start: [
      path.join(DATADIR, 'startnodes.lst'),
      'https://www.mochimap.com/startnodes.lst',
      'https://mochimo.org/startnodes.lst',
      'https://www.mochimap.net/startnodes.lst'
    ],
    _timer: null,
    consensus: () => {
      const chains = new Map();
      let consensus = null;
      Network.node._list.forEach(node => {
        // ensure node meets requirements
        if (!node.cblockhash) return;
        // increment consensus for chain
        if (chains.has(node.cblockhash)) {
          chains.set(node.cblockhash, chains.get(node.cblockhash) + 1);
        } else chains.set(node.cblockhash, 1);
        // determine consensus
        if (!consensus || chains.get(node.cblockhash) > chains.get(consensus)) {
          consensus = { bnum: node.cblock, bhash: node.cblockhash };
        }
      });
      return consensus;
    },
    scan: async () => {
      const fid = 'Network.node.scan():';
      const len = Network.node._list.size;
      let active = 0;
      Network.node._list.forEach((nodeJSON, ip) => {
        if (nodeJSON.status === Mochimo.VEOK) active++;
        Network.node.update(nodeJSON, ip); // asynchronous update
      });
      // complete network blackout failsafe and fresh start trigger
      if (!active && !Network.node._idle) Network.node._idle = Date.now();
      else if (active) Network.node._idle = 0;
      const idleTime = Network.node._idle ? Date.now() - Network.node._idle : 0;
      if (idleTime > Network.node._intervalUpdate || len === 0) {
        console.log(`Active/Total Nodes: ${active}/${len}; Seek more nodes...`);
        let i = 0;
        for (const source of Network.node._start) {
          console.log(fid, 'trying', source);
          try {
            let data = source.startsWith('http')
              ? await readWeb(source) : await fsp.readFile(source, 'utf8');
            if (data && typeof data === 'string') {
              data = data.match(/(^|(?<=\n))[\w.]+/g);
              if (data && data.length) {
                data = data.filter(ip => isIPv4(ip) && !isPrivateIPv4(ip));
                if (data.length) {
                  data = data.filter(ip => !Network.node._list.has(ip));
                  if (data.length) {
                    data.forEach(ip => {
                      const node = new Mochimo.Node({ ip }).toJSON();
                      Network.node._list.set(ip, node); // add to _list
                      Network.node.update(node, ip); // call node
                    });
                    console.log(fid, source, 'added', data.length, 'nodes');
                    break;
                  } else console.error(fid, source, 'yields no additional IPs');
                } else console.error(fid, source, 'yields no valid IP data');
              } else console.error(fid, source, 'yields no valid data');
            } else console.error(fid, source, 'yields no string data');
          } catch (error) { console.error(fid, source, 'failure;', error); }
          i++;
        }
        if (i === Network.node._start.length) {
          Network.node._timer =
            setTimeout(Network.node.scan, Network.node._intervalScanFailure);
          return console.error(fid, 'failure! Retry in',
            (Network.node._intervalScanFailure / 1000), 'seconds...');
        }
      }
      Network.node._timer =
        setTimeout(Network.node.scan, Network.node._intervalScan);
    },
    update: async (node, ip) => {
      const internalCall = Boolean(typeof ip === 'undefined');
      const via = internalCall ? 'internal' : 'scan()';
      const fid = `Network.update.node(${via}):`;
      const updateOffset = Date.now() - Network.node._intervalUpdate;
      if (internalCall) {
        // extract data from, and update, Network node (overwrites properties)
        ip = node.ip;
        node = node.toJSON();
        // define reference to old node data
        const oldNode = Network.node._list.get(ip);
        if (oldNode) {
          // determine differences between latest node data and broadcast
          const updates = objectDifference(oldNode, node);
          if (!objectIsEmpty(updates)) {
            updates.ip = ip; // ensure identification integrity
            Server.broadcast('networkUpdates', 'network', updates);
          }
        } else Server.broadcast('networkUpdates', 'network', node);
        Network.node._list.set(ip, Object.assign(oldNode || {}, node)); // update
        // check for new non-private nodes in peerlist
        if (Array.isArray(node.peers)) {
          node.peers.forEach(peer => {
            if (isPrivateIPv4(peer) || Network.node._list.has(peer)) return;
            console.log(fid, 'added', peer, 'via', ip, 'peerlist');
            const peerNode = new Mochimo.Node({ ip: peer });
            Network.node.update(peerNode).catch(console.trace);
          });
        }
        // initiate asynchronous block check on nodes returning a blockhash
        if (node.cblockhash) Network.block.check(node).catch(console.trace);
      } else if (node.lastTouch < updateOffset) {
        // update lastTouch and request peerlist
        node.lastTouch = Date.now();
        Mochimo.Node.callserver({ ip, opcode: Mochimo.OP_GETIPL })
          .then(Network.node.update).catch(console.trace);
      }
    }
  }
}; // end const Network...
const Server = {
  _api: null,
  _response: (res, json, statusCode, statusMessage) => {
    const body = JSON.stringify(json, null, 2);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    };
    if (!statusMessage) {
      switch (statusCode) {
        case 200: statusMessage = 'OK'; break;
        case 400: statusMessage = 'Bad Request'; break;
        case 404: statusMessage = 'Not Found'; break;
        case 500: statusMessage = 'Internal Server Error'; break;
        default: statusMessage = '';
      }
    }
    res.writeHead(statusCode, statusMessage, headers);
    res.end(body);
    return null;
  },
  _valid: {
    hex: (req, res, data) => {
      for (const [name, str] of Object.entries(data)) {
        if (str.replace(/[0-9A-Fa-f]/g, '')) { // checks for non-hex characters
          const error = `Invalid hexadecimal characters in ${name}`;
          return Server._response(res, { error }, 400);
        }
      }
      return true;
    },
    method: (req, res, method = 'GET') => {
      if (req.method !== method) {
        const error =
          `Invalid request method: expected ${method}, got ${req.method}`;
        return Server._response(res, { error }, 400);
      }
      return true;
    }
  },
  broadcast: (type, event, data) => { /* noop until websockets */ },
  request: async (req, res) => {
    // derive request path
    const { pathname /* , searchParams */ } = new URL(req.url, BASEURL);
    const path = pathname.split('/').filter(NotEmpty).map(LowerCase);

    switch (path.shift()) {
      case 'balance': {
        try {
          if (Server._valid.method(req, res)) { // ensure request method is GET
            let isTag = true;
            let address = path.shift();
            if (address === 'wots') {
              address = path.shift();
              isTag = false;
            } // else if (address === '<next address type>') ...
            if (Server._valid.hex(req, res, { address })) { // check parameters
              // query ledger via node
              const lentry = Mochimo.getBalance(CUSTOMNODE, address, isTag);
              if (lentry === null) {
                const error = 'Address could not be found in ledger';
                return Server._response(res, { error }, 404);
              } else return Server._response(res, lentry, 200);
            }
          }
        } catch (error) { return Server._response(res, undefined, 500); }
        break;
      } /*
      case 'block': {
        if (Server._valid.method(req, res)) { // ensure request method is GET
          const bnum = 0;
        }
        break;
      } */
    }
    // assume invalid request
    const error = 'Invalid request path';
    Server._response(res, { error }, 400);
  },
  start: () => new Promise((resolve, reject) => {
    const fid = 'Server.start():';
    console.log(fid, 'creating new http/s server...');
    // create http/s server
    Server._api = process.env.PRODUCTION
      ? https.createServer({ // secure production server
        key: fs.readFileSync('/etc/ssl/private/mochimap.com.key'),
        cert: fs.readFileSync('/etc/ssl/certs/mochimap.com.pem')
      }) : http.createServer(); // insecure development server
    // set http server events
    Server._api.on('request', Server.request);
    Server._api.on('error', reject);
    Server._api.on('listening', () => {
      const { address, port } = Server._api.address();
      console.log(fid, `${address}:${port} ready`);
      resolve();
    });
    // start http server
    Server._api.listen(process.env.PRODUCTION ? 443 : 80, '0.0.0.0');
  })
};

/* cleanup */
const gracefulShutdown = (err, origin = 'unknown') => {
  console.error(`\nSHUTDOWN recv'd ${err} frpm ${origin}`);
  // clear timers
  if (Network.node._timer) clearTimeout(Network.node._timer);
  // close server and/or exit
  if (Server._api) {
    // initiate server shutdown
    Server._api.close(() => {
      console.log('Server closed...\n');
      process.exit(Number(err) || 1);
    });
  } else {
    console.log('Nothing to finish...\n');
    process.exit(Number(err) || 1);
  }
};
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('uncaughtException', gracefulShutdown);

/* startup */
console.log('Begin startup...');
// start api server and network scanning
Server.start().then(Network.node.scan).catch(gracefulShutdown);

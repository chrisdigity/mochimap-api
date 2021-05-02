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

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const http = require('http');
const https = require('https');
// const crypto = require('crypto');
const { isIPv4 } = require('net');
const {
  isPrivateIPv4,
  ms,
  // objectDifference,
  // objectIsEmpty,
  readWeb,
  visualizeHaiku
} = require('./util');
const Mongo = require('./mongo');
const Mochimo = require('mochimo');
const Router = require('./router');

/* pre-core */
// const GENESIS_HASH =
//   '00170c6711b9dc3ca746c46cc281bc69e303dfad2f333ba397ba061eccefde03';
const SET_LIMIT = 0xfff;
const DATADIR = path.join('.', 'data');
const BCDIR = path.join(DATADIR, 'bc');

const Network = {
  block: {
    _cache: new Set(), // TODO: switch to using _chain
    _chain: new Map(),
    check: async (node, bnum, bhash, noExtended) => {
      const fid = 'Network.block.check():';
      let ip;
      if (typeof node === 'object') {
        noExtended = node.noExtended;
        bhash = node.cblockhash;
        bnum = node.cblock;
        ip = node.ip;
      } else ip = node;
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
          Network.block._cache.delete(
            Network.block._cache.values().next().value);
        }
        // check database has received block update
        const hasBlock = await Mongo.has('block', bnum, bhash);
        if (!hasBlock) {
          try { // download/verify block is as advertised
            const block = await Network.block.download(ip, bnum, bhash);
            // initiate block update
            await Network.block.update(block, noExtended);
            // asynchronous check for previous blocks
            const phash = block.phash;
            const pbnum = block.bnum - 1n;
            await Network.block.check(ip, pbnum, phash, true);
          } catch (error) { // trace errors
            Network.block._cache.add(bhash);
            console.trace(fid, error);
          } finally { // check integrity of stored blockchain
            if (!noExtended) await Network.block.integrity(bnum, bhash);
          }
        }
      }
    },
    download: async (ip, bnum, bhash) => {
      const fid = 'Network.block.download():';
      const block = await Mochimo.getBlock(ip, bnum);
      if (block.bnum !== bnum) {
        throw new Error(`${fid} Downloaded ${bnum} from ${ip}, got ${bnum}`);
      } else if (block.bhash !== bhash) {
        throw new Error(`${fid} Downloaded ${bnum}/${bhash.slice(0, 8)}~ from` +
          `${ip} got ${block.bnum}/${block.bhash.slice(0, 8)}~`);
      } else if (block.type === Mochimo.Block.INVALID) {
        throw new Error(`${fid} Downloaded ${bnum}/${bhash.slice(0, 8)}~ from` +
          ip + 'got invalid block type');
      }
      return block;
    },
    integrity: async (bnum, bhash) => {
      const fid = 'Network.block.integrity():';
      let backscan = ((~(bnum - 1n)) & bnum) * 2n; // determine backscan depth
      if (backscan > bnum) backscan = bnum; // apply bnum backscan limit
      if (backscan > 0xffn) console.log(fid, backscan, 'block backscan...');
      while (backscan--) {
        let block;
        try { // check database for block
          const _id = Mongo.util.id.block(bnum, bhash);
          block = await Mongo.findOne('block', { _id });
        } catch (error) { console.trace(fid, error); }
        if (!block) { // query all nodes for block if not found
          for (const node of Network.node._list.values()) {
            if (node.status) return; // ignore nodes with issues
            try { // download block from next node
              block = await Network.block.download(node.ip, bnum, bhash);
              await Network.block.update(block); // process block update
              break; // block check/update successful
            } catch (error) { // download failed, report and try next node
              console.error(fid, error);
            }
          }
        } // check for block again, TODO: send email report alerting failure
        if (!block) return console.trace(fid, 'blockchain integrity failure!');
        // update bnum and bhash
        bnum -= 1n;
        bhash = block.phash;
      }
      console.log(fid, 'integrity verified!');
    },
    update: async (block, noVisual) => {
      const fid = 'Network.block.update():';
      // minify block and send to Server interface for asynchronous broadcast
      const blockJSON = block.toJSON(true);
      Server.broadcast('blockUpdates', 'block', blockJSON);
      // store raw block on local disk (no overwrite, excl. neogenesis blocks)
      const { bhash, bnum, stime } = block;
      if (bnum & 0xffn) {
        try {
          const id = Mongo.util.id.block(bnum, bhash);
          const fpath = path.join(BCDIR, id.replace('-', '.') + '.bc');
          await fsp.mkdir(BCDIR, { recursive: true });
          await fsp.writeFile(fpath, Buffer.from(block.buffer), { flag: 'wx' });
        } catch (error) {
          console.error(fid, `failed to write raw block to ${path};`, error);
        }
      }
      // process block update
      const txDocuments = [];
      blockJSON._id = Mongo.util.id.block(bnum, bhash);
      // handle transactions on normal blocks
      if (blockJSON.type === Mochimo.Block.NORMAL) {
        block.transactions.forEach(txe => {
          // minify txe and add bhash / bnum
          txe = Object.assign(txe.toJSON(true), { bhash, bnum, stime });
          // add _id, filter BigInt values and add to docs
          txe._id = Mongo.util.id.transaction(bnum, bhash, txe.txid);
          txDocuments.push(Mongo.util.filterBigInt(txe));
        });
      }
      Mongo.util.filterBigInt(blockJSON);
      const bInsert = await Mongo.insert('block', blockJSON);
      if (bInsert < 1) {
        throw new Error(
          `${fid} insert error, inserted ${bInsert}/1 block documents`);
      }
      if (txDocuments.length) {
        const txInsert = await Mongo.insert('transaction', txDocuments);
        if (txInsert < txDocuments.length) {
          throw new Error(`${fid} insert error, ` +
            `inserted ${txInsert}/${txDocuments.length} transaction documents`);
        }
      }
      // send block data to visualizer for haiku visualization
      if (!noVisual) await Network.block.visualizer(blockJSON);
      // return block for promise chaining
      return block;
    },
    visualizer: async (block) => {
      const bhash = block.bhash;
      const bnum = block.bnum;
      // find appropriate block to use for haiku visualization
      let checkback = 0;
      let shadow = 0;
      while (block.type !== Mochimo.Block.NORMAL || checkback > 0) {
        shadow |= checkback;
        if (block.type === Mochimo.Block.NORMAL) checkback--; // decrease checkback
        else {
          shadow |= ++checkback; // increase checkback and trigger shadow haiku
          // get previous block data (if available) and start over
          const _id = Mongo.util.id.block(BigInt(block.bnum) - 1n, block.bhash);
          block = await Mongo.findOne('block', { _id });
          if (block) continue;
          break;
        }
      }
      // visualize Haiku from appropriate block data
      if (block) {
        shadow = Boolean(shadow);
        const haiku = Mochimo.Trigg.expand(block.nonce, shadow);
        const visual = await visualizeHaiku(haiku, shadow);
        // send haiku to Server interface for asynchronous broadcast
        Server.broadcast('haikuUpdates', 'haiku', visual);
        // send haiku to Mongo interface for asynchronous database update
        const _id = Mongo.util.id.block(BigInt(bnum), bhash);
        await Mongo.update('block', visual, { _id });
      } else console.warn(`cannot visualize bnum ${bnum} at this time...`);
    }
  },
  node: {
    _idle: 0,
    _list: new Map(),
    _start: [
      path.join(DATADIR, 'startnodes.lst'),
      'https://www.mochimap.com/startnodes.lst',
      'https://mochimo.org/startnodes.lst',
      'https://www.mochimap.net/startnodes.lst',
      false // indicates failure
    ],
    _timer: null,
    add: async (fid, ip, source) => {
      console.log(fid, 'adding', ip, 'via', source);
      const node = new Mochimo.Node({ ip }).toJSON();
      Network.node._list.set(ip, node); // add to _list
      await Network.node.update(node, ip); // update node
    },
    consensus: () => {
      const chains = new Map();
      let consensus = null;
      Network.node._list.forEach(node => {
        // ensure node has cblockhash and VEOK status
        if (!node.cblockhash || node.status) return;
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
      // setup scan parameters and scan all registered nodes, asynchronously
      const len = Network.node._list.size;
      let active = 0;
      Network.node._list.forEach((nodeJSON, ip) => {
        if (nodeJSON.status === Mochimo.VEOK) active++;
        Network.node.update(nodeJSON, ip).catch(console.trace);
      });
      // fresh start or complete network blackout check
      if (!active && !Network.node._idle) Network.node._idle = Date.now();
      else if (active) Network.node._idle = 0;
      const idleTime = Network.node._idle ? Date.now() - Network.node._idle : 0;
      if (idleTime > Network.node._intervalUpdate || len === 0) {
        console.log(`Active/Total Nodes: ${active}/${len}; Seek more nodes...`);
        for (const source of Network.node._start) {
          if (!source) { // check source failure
            Network.node._timer = setTimeout(Network.node.scan, ms.minute);
            return console.error(fid, 'failure! Retry in 60 seconds...');
          } else console.log(fid, 'trying', source);
          try { // download and decipher data from source
            let data = source.startsWith('http')
              ? await readWeb(source) : await fsp.readFile(source, 'utf8');
            if (typeof data !== 'string') throw new Error('no string data');
            data = (data.match(/(^|(?<=\n))[\w.]+/g) || []);
            data = data.filter(ip =>
              isIPv4(ip) && !isPrivateIPv4(ip) && !Network.node._list.has(ip));
            if (!data.length) throw new Error('no additional/valid IP data');
            // add valid nodes to network node list
            for (const ip of data) await Network.node.add(fid, ip, source);
            break; // end loop
          } catch (error) { console.error(fid, source, 'failure;', error); }
        }
      }
      Network.node._timer = setTimeout(Network.node.scan, ms.second);
    },
    update: async (nodeJSON) => {
      const internalCall = typeof nodeJSON.status === 'undefined';
      const fid = `Network.node.update(${internalCall ? 'internal' : 'scan'}):`;
      const ip = nodeJSON.ip; // dereference ip
      const now = Date.now(); // get timestamp
      const dropOffset = now - ms.day; // calc drop offset
      const updateOffset = now - (ms.second * 20); // calc update offset
      // remove stale nodes after 1 day, otherwise check node update condition
      if (typeof nodeJSON.lastOk === 'undefined') nodeJSON.lastOk = now;
      if (nodeJSON.lastOk < dropOffset) return Network.node._list.delete(ip);
      if (typeof nodeJSON.lastTouch === 'undefined') nodeJSON.lastTouch = 0;
      if (nodeJSON.lastTouch < updateOffset) {
        nodeJSON.lastTouch = now; // update before peerlist request
        // build options and perform peerlist request
        const nodeOptions = { ip, opcode: Mochimo.OP_GETIPL };
        const node = (await Mochimo.Node.callserver(nodeOptions)).toJSON();
        // initiate asynchronous block check on nodes returning a blockhash
        if (node.cblockhash) Network.block.check(node).catch(console.trace);
        // check for additional nodes in resulting peerlist
        if (Array.isArray(node.peers)) {
          for (const peer of node.peers) {
            if (isPrivateIPv4(peer) || Network.node._list.has(peer)) continue;
            // queue asynchronous add and scan of additional peers on peerlist
            Network.node.add(fid, peer, ip).catch(console.trace);
          }
        }
        // check geolocation update condition
        const ipinfoOffset = now - ms.week; // calc geo offset
        if (typeof nodeJSON.ipinfoTime === 'undefined') nodeJSON.ipinfoTime = 0;
        if (nodeJSON.ipinfoTime < ipinfoOffset) {
          const ipinfoSource =
            `https://ipinfo.io/${ip}/json?token=${process.env.IPINFO}`;
          const ipinfo = await readWeb(ipinfoSource);
          if (typeof ipinfo === 'object') {
            node.ipinfoTime = Date.now();
            if (!ipinfo.error) {
              delete ipinfo.ip;
              node.ipinfo = ipinfo;
            } else console.trace(ipinfoSource, JSON.stringify(ipinfo.error));
          } else console.trace(ipinfoSource, 'failed to return json data');
        }
        /* // check for realtime changes to map structure
        const oldNode = Network.node._list.get(ip);
        if (oldNode) {
          // determine differences between latest node data and broadcast
          const updates = objectDifference(oldNode, node);
          if (!objectIsEmpty(updates)) {
            updates.ip = ip; // ensure identification integrity
            Server.broadcast('networkUpdates', 'network', updates);
          }
        } else Server.broadcast('networkUpdates', 'network', node); */
        // assign node data to network list
        Object.assign(nodeJSON, node);
        // filter BigInt values from node for Mongo compatibility
        const filter = { upsert: true };
        const query = { _id: Mongo.util.id.network(ip) };
        Mongo.update('network', Mongo.util.filterBigInt(node), query, filter);
      }
    }
  }
}; // end const Network...
const Server = {
  _api: null,
  _apiConnections: new Set(),
  broadcast: (type, event, data) => { /* noop until websockets */ },
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
    Server._api.on('request', Router);
    Server._api.on('error', reject);
    Server._api.on('connect', (res, socket/* , head */) => {
      Server._apiConnections.add(socket); // track connections
      socket.on('end', () => Server._apiConnections.delete(socket));
    });
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
    // disconnect existing connections
    Server._apiConnections.forEach(socket => socket.destroy());
  } else {
    console.log('Nothing to finish...\n');
    process.exit(Number(err) || 1);
  }
};
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('uncaughtException', console.trace);

/* startup */
console.log('Begin startup...');
// start api server and begin network scanning
Server.start().then(Network.node.scan).catch(gracefulShutdown);

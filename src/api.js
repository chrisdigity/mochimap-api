#!/usr/bin/env node
/**
 *  api.js; Mochimo Cryptocurrency Network API (primarily) for MochiMap
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

/* global BigInt */

// monkey-patch BigInt serialization
/* eslint no-extend-native: ["error", { "exceptions": ["BigInt"] }] */
BigInt.prototype.toJSON = function () { return this.toString(); };

console.log('\n// START: ' + __filename);

const capitalize = (s) => s.length ? s[0].toUpperCase() + s.slice(1) : '';

/* regex */
const regexParams = /^[?]?(?:[0-9a-z]+(?:(?:<>|<=|>=|<|>|=)[0-9a-z-.*]+)?[&|]?)*$/i;
const regexKeyValue = /^([0-9a-z]+)(?:(<>|<=|>=|<|>|=)([0-9a-z-.*]+))?$/i;

/* modules and utilities */
const Server = require('./server');
const BlkScanner = require('./scannerblk');
const MemScanner = require('./scannermem');
const NetScanner = require('./scannernet');
const { createHash } = require('crypto');
const mochimo = require('mochimo');
const mysql2 = require('mysql2');

/* environment configuration */
require('dotenv').config();

/* database configuration */
const mysql = {
  rw: mysql2.createPool({
    database: process.env.DBNAME || 'mochimo',
    password: process.env.DBPASS || 'password',
    user: process.env.DBUSER || 'mochimo',
    host: process.env.DBHOST || 'localhost',
    port: process.env.DBPORT_RW || process.env.DBPORT || 3306,
    waitForConnections: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: 'Z'
  }),
  ro: mysql2.createPool({
    database: process.env.DBNAME || 'mochimo',
    password: process.env.DBPASS || 'password',
    user: process.env.DBUSER || 'mochimo',
    host: process.env.DBHOST || 'localhost',
    port: process.env.DBPORT_RO || process.env.DBPORT || 3306,
    waitForConnections: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: 'Z'
  }),
  query: (table, options, callback) => {
    let { limit, offset, orderby, search, select } = options;
    let where = '';
    // consume search and place in `where`
    while (search) {
      const nextbrkp = search.slice(1).search(/[?&|]/g) + 1;
      const condition = nextbrkp
        ? search.slice(1, nextbrkp)
        : search.slice(1);
      // check condition
      if (condition) {
        const matched = condition.match(regexKeyValue);
        if (matched) {
          // drop match
          matched.shift();
          let [column, comparitor, value] = matched;
          // check for "special" parameters
          if (value) {
            switch (column) {
              case 'limit':
                // cleanse limit value
                limit = isNaN(value) ? 10 : Number(value);
                if (limit > 100) limit = 100;
                if (limit < 0) limit = 0;
                break;
              case 'offset':
                // cleanse offset value
                offset = isNaN(value) ? 0 : Number(value);
                if (offset < 0) offset = 0;
                break;
              default:
                if (value.includes('*')) {
                  value = value.replace(/[*]/g, '%');
                  if (comparitor === '<>') comparitor = 'NOT LIKE';
                  else if (comparitor === '=') comparitor = 'LIKE';
                }
                // apply condition extension and modified condition
                if (search.charAt(0) === '&') where += ' AND ';
                if (search.charAt(0) === '|') where += ' OR ';
                where += `\`${column}\` ${comparitor} '${value}'`;
            }
          }
        }
      }
      // reduce search for next round
      search = nextbrkp ? search.slice(nextbrkp) : '';
    }
    // perform restricted query
    mysql.ro.query(`
      SELECT ${
        Array.isArray(select) ? select.join(', ') : (select || '*')}
      from \`${table}\`
      ${where ? `WHERE ${where}` : ''}
      ${orderby ? `ORDER BY ${orderby}` : ''}
      ${offset ? `OFFSET ${offset}` : ''}
      ${limit ? `LIMIT ${limit}` : 'LIMIT 10'}
    `, callback);
  }
};

// create Server instance
const server = new Server({
  secure: Boolean(process.env.SSLCERT && process.env.SSLKEY),
  sslCert: process.env.SSLCERT,
  sslkey: process.env.SSLKEY
});

// start scanners
const blkscanner = new BlkScanner({
  db: mysql.rw, emit: server.streamEmit.bind(server)
});
const memscanner = new MemScanner({
  db: mysql.rw, emit: server.streamEmit.bind(server)
});
const netscanner = new NetScanner({
  db: mysql.rw, emit: server.streamEmit.bind(server)
});

/* route configuration */
server.enableRoute({
  method: 'GET',
  path: /^\/$/,
  handler: async (res) => server.respond(res, 'OK', 200)
});
server.enableRoute({
  method: 'GET',
  path: /^\/balance\/(?:delta|(tag|address)\/([0-9a-f]+))$/i,
  param: regexParams,
  hint: '[BaseURL]/balance/<delta||(<tag||address>/[addressParameter])>',
  hintCheck: /balance|ledger|delta|tag|address/gi,
  handler: async (res, params) => {
    if (params && ['tag', 'address'].includes(params)) {
      // perform balance request
      const [type, address] = params;
      const isTag = Boolean(type === 'tag');
      const typeStr = isTag ? 'tag' : 'wots+';
      let le = await mochimo.getBalance(process.env.FULLNODE, address, isTag);
      if (le) { // deconstruct ledger entry and compute sha256 of address
        const { address, balance, tag } = le;
        const addressHash = createHash('sha256').update(address).digest('hex');
        // reconstruct ledger entry with sha256
        le = { address, addressHash, tag, balance };
      }
      // send successfull query or 404
      return le
        ? server.respond(res, le, 200)
        : server.respond(res, { message: `${typeStr} not found in ledger...` });
    } else {
      // perform balance delta search
      const options = { orderby: '`bnum` DESC' };
      mysql.query('balance', options, params[0], (error, results) => {
        if (error) server.respond(res, Server.InternalError(error), 500);
        else server.respond(res, { results }, 200);
      });
    }
  }
});
server.enableRoute({
  method: 'GET',
  path: /^\/block(?:\/([0-9]+|0x[0-9a-f]+)?)?(?:\/([a-z]+\/?)?)?$/i,
  param: regexParams,
  hint: '[BaseURL]/block/[bnum]/[blockParam]',
  hintCheck: /block|bc/gi,
  handler: async (res, bnum, bparam, search) => {
    // perform block search
    const options = { orderby: '`created` DESC', search };
    mysql.query('block', options, (error, results) => {
      if (error) server.respond(res, Server.InternalError(error), 500);
      else server.respond(res, { results }, 200);
    });
  }
});
server.enableRoute({
  method: 'GET',
  path: /^\/network(?:\/(?:(active)||peers\/(active|push|start))?)?(?:\/(?:(?=\d+\.\d+\.\d+\.\d+)((?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\.?){4}))?)?$/i,
  hint: '[BaseURL]/network[/active[/IPv4]||peers</active||push||start>]',
  hintCheck: /network|active|peers|push|start/gi,
  handler: (res, status, listType, ip) => {
    const start = Date.now();
    const peerOptions = {};
    if (status === 'active' || listType) peerOptions.status = mochimo.VEOK;
    if (ip) peerOptions.ip = ip;
    let results = netscanner.getPeers(peerOptions);
    // sort peers by weight, then uptime
    results.sort((a, b) => {
      const aWeight = BigInt(`0x0${a.weight}`);
      const bWeight = BigInt(`0x0${b.weight}`);
      if (aWeight < bWeight) return 1;
      if (aWeight > bWeight) return -1;
      const aUptime = a.uptimestamp ? a.timestamp - a.uptimestamp : 0;
      const bUptime = b.uptimestamp ? b.timestamp - b.uptimestamp : 0;
      return bUptime - aUptime;
    });
    // handle results appropriately
    if (listType) {
      if (listType === 'push') {
        results = results.filter((peer) => peer.cbits & mochimo.C_PUSH);
      }
      const found = results.length;
      if (listType !== 'active' && results.length) {
        // perform a reverse widening deletion until list size is reached
        let b = 0;
        const bf = Math.floor(Math.cbrt(results.length)) || 1;
        while (results.length > 16) {
          const u = results.length - 1; // upper bound
          const l = Math.max(0, u - ((b++) / bf)); // lower bound
          const r = Math.floor(Math.random() * (u - l + 1) + l); // bound rng
          results.splice(r, 1); // remove selected index
        }
      }
      // build peerlist content
      let content = `# Mochimo ${capitalize(listType)} Peerlist, `;
      content += `built on ${new Date()}\n# Build; `;
      content += `time= ${Date.now() - start}ms, peers= ${found}, `;
      content += `height= ${results[0] && results[0].cblock}, `;
      content += `weight= 0x${results[0] && results[0].weight}\n`;
      results.forEach((peer) => { content += `${peer.ip}\n`; });
      server.respond(res, content, 200);
    } else {
      if (!results.length) {
        server.respond(res, {
          message: 'Nothing found matching request'
        });
      } else server.respond(res, { found: results.length, results }, 200);
    }
  }
});
server.enableRoute({
  method: 'GET',
  path: /^\/transaction(?:\/([0-9a-f]+)?)?$/i,
  param: regexParams,
  hint: '[BaseURL]/transaction/[txid]?[searchParameter]=[searchValue]',
  hintCheck: /transaction/gi,
  handler: async (res, txid, search) => {
    // perform balance delta search
    const options = { orderby: '`created` DESC', search };
    mysql.query('transaction', options, (error, results) => {
      if (error) server.respond(res, Server.InternalError(error), 500);
      else server.respond(res, { results }, 200);
    });
  }
});
server.enableStream({
  path: /^\/stream(?:\/)?$/,
  param: /^[?]?(?:(?:block|network|transaction)+(?:=|=on)?(?:$|&))+$/i,
  paramsRequired: true,
  hint: '[BaseURL]/stream<?streamTypes>',
  hintCheck: /stream|block|network|transaction/gi
}, ['block', 'network', 'transaction']);
/*
server.enableRoute({
  method: 'GET',
  path: /^\/block(?:\/(?:([0-9]+)|(0x[0-9a-f]+))?)?(?:\/([a-z0-9]+)?)?$/i,
  param: /^[?]?(?:[0-9a-z]+(?:(?:<(?:>|=)?|>=?|=)[0-9a-z-.]+(?:$|&))?)+$/i,
  hint: '[BaseURL]/block/[blockNumber]/[blockParameter]' +
    '?[searchParameter]=[searchValue]',
  hintCheck: /block|0x/gi,
  handler: async (res, blockNumber, blockHex) => {
    try {
      const query = {}; // undefined blockNumber/blockHex will find latest
      if (typeof blockNumber === 'undefined') blockNumber = blockHex;
      if (typeof blockNumber !== 'undefined') {
        // convert blockNumber parameter to Long number type from Big Integer
        query.bnum = Db.util.long(BigInt(blockNumber));
      }
      // perform block query
      let block = await Db.findOne('block', query);
      const status = block ? 200 : 404;
      if (!block) block = { message: `${blockNumber} could not be found...` };
      // send successfull query or 404
      return Responder._respond(res, block, status);
    } catch (error) { Responder.unknownInternal(res, error); }
  }
});
server.enableRoute({
  method: 'GET',
  path: /^\/chain(?:\/(?:([0-9]+)|(0x[0-9a-f]+))?)?(?:\/([a-z0-9]+)?)?$/i,
  param: /^[?]?(?:[0-9a-z]+(?:(?:<(?:>|=)?|>=?|=)[0-9a-z-.]+(?:$|&))?)+$/i,
  hint: '[BaseURL]/chain/[chainNumber]/[chainParameter]' +
    '?[searchParameter]=[searchValue]',
  hintCheck: /chain|0x/gi,
  handler: 'chain'
});
server.enableRoute({
  method: 'GET',
  path: /^\/richlist(?:\/)?$/,
  param: /^[?]?(?:[0-9a-z]+(?:(?:<(?:>|=)?|>=?|=)[0-9a-z-.]+(?:$|&))?)+$/i,
  hint: '[BaseURL]/richlist?[searchParameter]=[searchValue]',
  hintCheck: /richlist/gi,
  handler: 'richlist'
});
*/

/* initialize cleanup crew */
const cleanup = (e, src) => {
  console.log(`\n// GLOBAL CLEANUP: initiated from source(${src})...`);
  server.cleanup()
    .then(blkscanner.cleanup.bind(blkscanner))
    .then(memscanner.cleanup.bind(memscanner))
    .then(netscanner.cleanup.bind(netscanner))
    .then(() => process.exit(Number(e) || 0))
    .catch(console.trace).finally(() => {
      console.log('// GLOBAL CLEANUP: failed to exit gracefully...');
      console.log('// GLOBAL CLEANUP: forcing exit...');
      process.exit(Number(e) || 1);
    });
};

/* configure cleanup crew */
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

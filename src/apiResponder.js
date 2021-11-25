/**
 *  apiResponder.js; Handles responses to API requests for MochiMap
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
BigInt.prototype.toJSON = function () { return Number(this.toString()); };

/* full node ipv4 check */
if (typeof process.env.FULLNODE === 'undefined') {
  console.warn('// WARNING: Mochimo full node ipv4 is undefined');
  console.warn('// Balance requests produce unexpected results...');
}

const { createHash } = require('crypto');
const { blockReward, capitalize, projectedSupply, round } = require('./apiUtils');
const Interpreter = require('./apiInterpreter');
const Db = require('./apiDatabase');
const Mochimo = require('mochimo');

const expandResults = async (cursor, options, start) => {
  const dbquery = { duration: null, found: await cursor.count() };
  if (options.limit) { // update number of pages in results
    dbquery.pages = Math.ceil(dbquery.found / options.limit);
  } // apply cursor array to results and update duration stat
  dbquery.results = await cursor.toArray();
  dbquery.duration = Date.now() - start;
  return dbquery;
};

const Responder = {
  _respond: (res, content, statusCode = 404, statusMessage = '') => {
    if (!statusMessage) {
      switch (statusCode) {
        case 200: statusMessage = 'OK'; break;
        case 400: statusMessage = 'Bad Request'; break;
        case 404: statusMessage = 'Not Found'; break;
        case 406: statusMessage = 'Not Acceptable'; break;
        case 409: statusMessage = 'Conflict'; break;
        case 422: statusMessage = 'Unprocessable Entity'; break;
        case 500: statusMessage = 'Internal Server Error'; break;
        default: statusMessage = '';
      }
    }
    // assign error and message properties if required
    if (statusCode > 399 && (typeof content === 'object' && !content.error)) {
      content = Object.assign({ error: statusMessage }, content);
    }
    // process response headers
    let body, type;
    if (typeof content === 'object') {
      body = JSON.stringify(content, null, 2);
      type = 'application/json';
    } else {
      body = String(content);
      type = 'text/plain; charset=utf-8';
    }
    const headers = {
      'X-Robots-Tag': 'none',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'no-referrer',
      'Content-Type': type,
      'Content-Length': Buffer.byteLength(body),
      'Content-Security-Policy':
        "base-uri 'self'; default-src 'none'; form-action 'self'; " +
        "frame-ancestors 'none'; require-trusted-types-for 'script';",
      'Access-Control-Allow-Origin': '*'
    };
    // send response
    res.writeHead(statusCode, statusMessage, headers);
    res.end(body);
  },
  block: async (res, blockNumber, blockHex) => {
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
  },
  chain: async (res, blockNumber, blockHex, param) => {
    try {
      // check valid parameters
      const valid = [
        'circsupply', 'totalsupply', 'maxsupply', 'bhash', 'phash', 'mroot',
        'nonce', 'haiku', 'bnum', 'mfee', 'time0', 'stime', 'blocktime',
        'blocktime_avg', 'tcount', 'tcount_avg', 'tcountpsec',
        'tcountpsec_avg', 'txfees', 'reward', 'mreward', 'difficulty',
        'difficulty_avg', 'hashrate', 'hashrate_avg', 'pseudorate_avg'
      ];
      if (param) {
        if (!valid.includes(param)) {
          return Responder._respond(res, {
            message: `parameter '${param}' is not a valid chain request...`
          });
        }
      }
      let chain;
      const target = 768;
      // convert blockNumber to Number value
      if (typeof blockNumber === 'undefined') blockNumber = blockHex;
      if (typeof blockNumber === 'undefined') blockNumber = -target;
      else blockNumber = Number(blockNumber);
      // calculate partial tfile parameters
      const count = blockNumber < target ? Math.abs(blockNumber) + 1 : target;
      const start = blockNumber > -1 ? blockNumber - (count - 1) : blockNumber;
      const tfile = await Mochimo.getTfile(process.env.FULLNODE, start, count);
      if (tfile) { // ensure tfile contains the requested block
        const tfileCount = tfile.length / Mochimo.BlockTrailer.length;
        const rTrailer = tfile.trailer(tfileCount - 1);
        if (blockNumber < 0 || blockNumber === Number(rTrailer.bnum)) {
          // deconstruct trailers and perform chain calculations
          let totalsupply;
          let rewards = 0n;
          let pseudorate = 0;
          let nonNeogenesis = 0;
          let transactions = 0;
          let blockTimes = 0;
          let hashesTimes = 0;
          let hashes = 0;
          let difficulties = 0;
          let index = tfile.length / Mochimo.BlockTrailer.length;
          for (index--; index >= 0; index--) {
            const trailer = tfile.trailer(index);
            const { bnum, bhash, mfee, tcount } = trailer;
            if (bnum & 0xffn) { // NON-(NEO)GENSIS block type
              const dT = trailer.stime - trailer.time0;
              difficulties += trailer.difficulty;
              blockTimes += dT;
              nonNeogenesis++;
              if (tcount) { // NORMAL block types
                transactions += tcount;
                hashesTimes += dT;
                hashes += Math.pow(2, trailer.difficulty);
                rewards += blockReward(bnum) + (mfee * BigInt(tcount));
              } else pseudorate++; // PSEUDO block types
            } else if (!totalsupply) { // (NEO)GENSIS block types
              try { // obtain ledger amount from database
                const query = { _id: Db.util.id.block(bnum, bhash) };
                const ng = await Db.findOne('block', query);
                Db.util.filterLong(ng); // ensure long values are BigInt
                if (ng && ng.amount) { // preform supply calculations
                  totalsupply = ng.amount + rewards;
                  // calculate lost supply and subtract from max supply
                  const lost = projectedSupply(rTrailer.bnum) - totalsupply;
                  const circsupply = projectedSupply(rTrailer.bnum, 1) - lost;
                  chain = {
                    circsupply: Number(circsupply) / 1e+9,
                    totalsupply: Number(totalsupply) / 1e+9,
                    maxsupply: Number(projectedSupply()) / 1e+9
                  };
                }
              } catch (ignore) {}
            }
          } // if chain is undefined by this point, neogenesis search failed ~3x
          if (chain) { // chain is available, perform remaining calculations
            const rTrailerJSON = rTrailer.toJSON();
            const { bhash, phash, mroot, nonce, bnum, mfee } = rTrailerJSON;
            const { difficulty, tcount, time0, stime } = rTrailerJSON;
            const isNeogenesis = Boolean(!(bnum & 0xffn));
            const json = { bhash, phash, mroot, nonce };
            if (nonce !== ''.padStart(64, 0)) {
              json.haiku = Mochimo.Trigg.expand(nonce);
            }
            json.bnum = bnum;
            json.mfee = mfee;
            json.time0 = time0;
            json.stime = stime;
            json.blocktime = isNeogenesis ? 0 : stime - time0;
            json.blocktime_avg = round(blockTimes / nonNeogenesis);
            json.tcount = tcount;
            json.tcount_avg = round(transactions / nonNeogenesis);
            json.tcountpsec = round(tcount / json.blocktime);
            json.tcountpsec_avg = round(transactions / blockTimes);
            json.txfees = isNeogenesis ? 0 : BigInt(tcount) * mfee;
            json.reward = isNeogenesis ? 0 : blockReward(bnum);
            json.mreward = isNeogenesis ? 0 : json.txfees + json.reward;
            json.difficulty = difficulty;
            json.difficulty_avg = round(difficulties / nonNeogenesis);
            json.hashrate = 0;
            if (json.tcount > 0) {
              json.hashrate = round(Math.pow(2, difficulty) / json.blocktime);
            }
            json.hashrate_avg = round(hashes / hashesTimes);
            json.pseudorate_avg = round(pseudorate / nonNeogenesis);
            // add json trailer data of requested block number to chain request
            chain = Object.assign(json, chain);
          }
        }
      }
      // check parameter request
      if (chain && param) {
        if (chain[param]) return Responder._respond(res, chain[param], 200);
        else {
          return Responder._respond(res, {
            message: `chain parameter '${param}' is unavailable this block...`
          });
        }
      }
      // send successfull acquisition or 404
      return chain
        ? Responder._respond(res, chain, 200)
        : Responder._respond(res, { message: 'chain data unavailable...' });
    } catch (error) { Responder.unknownInternal(res, error); }
  },
  ledger: async (res, addressType, address) => {
    try {
      // perform balance request
      const isTag = Boolean(addressType === 'tag');
      let le = await Mochimo.getBalance(process.env.FULLNODE, address, isTag);
      if (le) { // deconstruct ledger entry and compute sha256 of address
        const { address, balance, tag } = le;
        const addressHash = createHash('sha256').update(address).digest('hex');
        // reconstruct ledger entry with sha256
        le = { address, addressHash, tag, balance };
      }
      // send successfull query or 404
      return le
        ? Responder._respond(res, le, 200)
        : Responder._respond(res, {
          message: `${isTag ? 'tag' : 'wots+'} not found in ledger...`
        });
    } catch (error) { Responder.unknownInternal(res, error); }
  },
  network: async (res, status, ip) => {
    try {
      // move ip argument if no status was provided
      ip = ip || status;
      // perform network query
      const node = await Db.findOne('network', { 'host.ip': ip });
      // apply applicable status filter
      if (node && status === 'active') {
        // check for incomplete data
        if (typeof node.connection !== 'object') {
          return Responder.unknownInternal(res,
            { message: `${ip} is missing connection object...` });
        }
        // check all available regions
        for (const region of Object.values(node.connection)) {
          if (region.status) { // send 404 if any region returns not OK status
            return Responder._respond(res, {
              message: `${ip} node is not OK in all regions...`
            });
          }
        }
      }
      // send successfull query or 404
      return node
        ? Responder._respond(res, node, 200)
        : Responder._respond(res, { message: `${ip} could not be found...` });
    } catch (error) { Responder.unknownInternal(res, error); }
  },
  peerlist: async (res, listType) => {
    const start = Date.now();
    let cursor;
    try {
      // set defaults and interpret requested search params as necessary
      const search = { query: {}, options: {} };
      let query = '?connection.status=0&pversion:gte=4';
      if (listType === 'push') query += '&cbits:bitsAllSet=1';
      Object.assign(search, Interpreter.search(query, 0, 'network'));
      // query database for results
      cursor = await Db.find('network', search.query, search.options);
      const dbquery = await expandResults(cursor, search.options, start);
      const results = dbquery.results;
      if (results.length) {
        // sort peers by weight, then uptime
        results.sort((a, b) => {
          const aWeight = BigInt(`0x${a.weight}`);
          const bWeight = BigInt(`0x${b.weight}`);
          if (aWeight < bWeight) return 1;
          if (aWeight > bWeight) return -1;
          const upRed = (uptime, region) => {
            const connection = a.connection[region];
            if (connection.uptimestamp > 0) {
              return uptime + (connection.timestamp - connection.uptimestamp);
            } else return 0;
          };
          const aRegs = Object.keys(a.connection);
          const bRegs = Object.keys(b.connection);
          const aUp = aRegs.length && (aRegs.reduce(upRed, 0) / aRegs.length);
          const bUp = bRegs.length && (bRegs.reduce(upRed, 0) / bRegs.length);
          return bUp - aUp;
        });
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
      let content = `# Mochimo ${capitalize(listType)} peerlist, `;
      content += `built on ${new Date()}\n# Build; `;
      content += `time= ${Date.now() - start}ms, peers= ${dbquery.found}, `;
      content += `height= ${results[0] && results[0].cblock}, `;
      content += `weight= ${results[0] && results[0].weight}`;
      Responder._respond(res, content, 200);
    } catch (error) { // send 500 on internal error
      Responder.unknownInternal(res, error);
    } finally { // cleanup cursor
      if (cursor && !cursor.isClosed()) await cursor.close();
    }
  },
  search: async (cName, paged, res, ...args) => {
    const start = Date.now();
    let cursor;
    try {
      // set defaults and interpret requested search params as necessary
      const search = { query: {}, options: {} };
      Object.assign(search, Interpreter.search(args[0], paged, cName));
      // query database for results
      cursor = await Db.find(cName, search.query, search.options);
      const dbquery = await expandResults(cursor, search.options, start);
      // send succesfull query or 404
      if (dbquery.results.length) Responder._respond(res, dbquery, 200);
      else Responder._respond(res, dbquery, 404, 'No results');
    } catch (error) { // send 500 on internal error
      Responder.unknownInternal(res, error);
    } finally { // cleanup cursor
      if (cursor && !cursor.isClosed()) await cursor.close();
    }
  },
  searchBlock: (...args) => Responder.search('block', 1, ...args),
  searchLedger: (...args) => Responder.search('ledger', 1, ...args),
  searchNetwork: (...args) => Responder.search('network', 0, ...args),
  searchRichlist: (...args) => Responder.search('richlist', 1, ...args),
  searchTransaction: (...args) => Responder.search('transaction', 1, ...args),
  transaction: async (res, txid) => {
    try {
      // perform transaction query
      const transaction = await Db.findOne('transaction', { txid });
      // send successfull query or 404
      return transaction
        ? Responder._respond(res, transaction, 200)
        : Responder._respond(res, { message: `${txid} could not be found...` });
    } catch (error) { Responder.unknownInternal(res, error); }
  },
  unknown: (res, content = 'OK', code = 200) => {
    return Responder._respond(res, content, code);
  },
  unknownInternal: (res, error) => {
    // log error and send alert response
    console.trace(error);
    const timestamp = (new Date()).toISOString();
    const message = error
      ? `${error}`
      : ('MochiMap API has encountered an unexpected error. ' +
        'Tag @Chrisdigity on the Mochimo Official Discord, or detail ' +
        'this event @ https://github.com/chrisdigity/mochimap-api/issues');
    return Responder.unknown(res, { message, timestamp }, 500);
  }
};

module.exports = Responder;

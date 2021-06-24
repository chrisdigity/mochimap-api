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
const { isPrivateIPv4, blockReward, projectedSupply } = require('./apiUtils');
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
  _respond: (res, statusCode, json, statusMessage = false) => {
    if (!statusMessage) {
      switch (statusCode) {
        case 200: statusMessage = 'OK'; break;
        case 400: statusMessage = 'Bad Request'; break;
        case 404: statusMessage = 'Not Found'; break;
        case 409: statusMessage = 'Conflict'; break;
        case 500: statusMessage = 'Internal Server Error'; break;
        default: statusMessage = '';
      }
    }
    // assign error and message properties if required
    if (statusCode > 299 && !json.error) {
      json = Object.assign({ error: statusMessage }, json);
    }
    // process response headers
    const body = JSON.stringify(json, null, 2) || '';
    const headers = {
      'X-Robots-Tag': 'none',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
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
      const block = await Db.findOne('block', query);
      // send successfull query or 404
      return Responder._respond(res, block ? 200 : 404, block ||
        { message: `${blockNumber} could not be found...` });
    } catch (error) { Responder.unknownInternal(res, error); }
  },
  chain: async (res, blockNumber, blockHex) => {
    try {
      let chain;
      // convert blockNumber to Number value
      if (typeof blockNumber === 'undefined') blockNumber = blockHex;
      if (typeof blockNumber === 'undefined') blockNumber = -1;
      else blockNumber = Number(blockNumber);
      // calculate partial tfile parameters
      const count = blockNumber < 768 ? Math.abs(blockNumber) + 1 : 768;
      const start = blockNumber > -1 ? blockNumber - (count - 1) : blockNumber;
      const tfile = await Mochimo.getTfile(process.env.FULLNODE, start, count);
      if (tfile) { // ensure tfile contains the requested block
        const tfileCount = tfile.length / Mochimo.BlockTrailer.length;
        const rTrailer = tfile.trailer(tfileCount - 1);
        if (blockNumber < 0 || blockNumber === Number(rTrailer.bnum)) {
          // deconstruct trailers and perform chain calculations
          let supply, temp;
          let aeonPseudoblocks = 0;
          let aeonRewards = 0n;
          const blocktimes = [];
          const hashestimes = [];
          const hashes = [];
          let index = tfile.length / Mochimo.BlockTrailer.length;
          for (index--; index >= 0; index--) {
            const trailer = tfile.trailer(index);
            const { bnum, bhash, mfee, tcount } = trailer;
            if (!supply) {
              if (!(bnum & 0xffn)) {
                if (!temp) temp = { aeonRewards, aeonPseudoblocks };
                try { // obtain ledger amount from database
                  const query = { _id: Db.util.id.block(bnum, bhash) };
                  const ng = await Db.findOne('block', query);
                  Db.util.filterLong(ng); // ensure long values are BigInt
                  if (ng && ng.amount) { // preform supply calculations
                    supply = ng.amount + aeonRewards;
                    // calculate lost supply and subtract from max supply
                    const lostSupply = projectedSupply(rTrailer.bnum) - supply;
                    const maxSupply = projectedSupply() - lostSupply;
                    Object.assign(temp, { maxSupply, supply });
                  }
                } catch (ignore) {}
              } else if (!tcount) aeonPseudoblocks++;
              else aeonRewards += blockReward(bnum) + (mfee * BigInt(tcount));
            }
            if (bnum & 0xffn) {
              const dT = trailer.stime - trailer.time0;
              blocktimes.push(dT);
              if (tcount) {
                hashestimes.push(dT);
                hashes.push(Math.pow(2, trailer.difficulty));
              }
            }
          }
          // transfer ownership of trailer to chain if supply was successfull
          if (temp && 'supply' in temp) chain = temp;
          // if chain is undefined by this point, neogenesis search failed ~3x
          if (chain) { // chain is available, perform remaining calculations
            const json = rTrailer.toJSON();
            const isNeogenesis = Boolean(!(json.bnum & 0xffn));
            json.txfees = isNeogenesis ? 0 : json.mfee * BigInt(json.tcount);
            json.reward = isNeogenesis ? 0 : blockReward(json.bnum);
            json.mreward = isNeogenesis ? 0 : json.txfees + json.reward;
            json.blocktime = isNeogenesis ? 0 : json.stime - json.time0;
            if (blocktimes.length) {
              json.blocktime_avg = (((blocktimes.reduce((acc, curr) => {
                return acc + curr;
              }, 0) / blocktimes.length) * 100) | 0) / 100;
            }
            json.hashrate = json.blocktime === 0 || json.tcount === 0 ? 0
              : Math.floor(Math.pow(2, json.difficulty) / json.blocktime);
            if (hashes) {
              json.hashrate_avg = (hashes.reduce((acc, curr) => {
                return acc + curr;
              }, 0) / hashestimes.reduce((acc, curr) => {
                return acc + curr;
              }, 0)) | 0;
            }
            // add json trailer of requested block number to chain request
            chain = Object.assign(json, chain);
          }
        }
      }
      // ensure chain was filled
      // send successfull acquisition or 404
      return Responder._respond(res, chain ? 200 : 404, chain ||
        { message: 'chain data unavailable...' });
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
      return Responder._respond(res, le ? 200 : 404, le ||
        { message: `${isTag ? 'tag' : 'wots+'} not found in ledger...` });
    } catch (error) { Responder.unknownInternal(res, error); }
  },
  network: async (res, status, ip) => {
    try {
      // move ip argument if no status was provided
      ip = ip || status;
      // check IPv4 for private formats
      if (isPrivateIPv4(ip)) {
        const error = 'Invalid IPv4 address';
        const message = 'private Iv4 addresses are not supported';
        return Responder._respond(res, 400, { error, message });
      }
      // perform network query
      const node = await Db.findOne('network', { 'host.ip': ip });
      // apply applicable status filter
      if (node && status === 'active') {
        // check for incomplete data
        if (typeof node.connection !== 'object') {
          Responder.unknownInternal(res,
            { message: `${ip} is missing connection object...` });
        }
        // check all available regions
        for (const region of Object.values(node.connection)) {
          if (region.status) { // send 404 if any region returns not OK status
            return Responder._respond(res, 404,
              { message: `${ip} node is not OK in all regions...` });
          }
        }
      }
      // send successfull query or 404
      return Responder._respond(res, node ? 200 : 404, node ||
        { message: `${ip} could not be found...` });
    } catch (error) { Responder.unknownInternal(res, error); }
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
      if (dbquery.results.length) Responder._respond(res, 200, dbquery);
      else Responder._respond(res, 404, dbquery, 'No results');
    } catch (error) { // send 500 on internal error
      Responder.unknownInternal(res, error);
    } finally { // cleanup cursor
      if (cursor && !cursor.isClosed()) await cursor.close();
    }
  },
  searchBlock: (...args) => Responder.search('block', 1, ...args),
  searchLedger: (...args) => Responder.search('ledger', 1, ...args),
  searchNetwork: (...args) => Responder.search('network', 0, ...args),
  searchTransaction: (...args) => Responder.search('transaction', 1, ...args),
  transaction: async (res, txid) => {
    try {
      // perform transaction query
      const transaction = await Db.findOne('transaction', { txid });
      // send successfull query or 404
      return Responder._respond(res, transaction ? 200 : 404, transaction ||
        { message: `${txid} could not be found...` });
    } catch (error) { Responder.unknownInternal(res, error); }
  },
  unknown: (res, code = 404, json = {}) => Responder._respond(res, code, json),
  unknownInternal: (res, error) => {
    // log error and send alert response
    console.trace(error);
    const date = new Date();
    Responder.unknown(res, 500, {
      message: 'please consider opening a issue detailing this error @ ' +
        'https://github.com/chrisdigity/mochimap.com/issues',
      timestamp: date.toISOString()
    });
  }
};

module.exports = Responder;

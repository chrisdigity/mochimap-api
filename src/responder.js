/**
 *  MochiMap Responder - Responds to requests made to the API
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

const Mochimo = require('mochimo');
const Mongo = require('./mongo');
const Interpreter = require('./interpreter');

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
      'Content-Length': Buffer.byteLength(body)
    };
    // send response
    res.writeHead(statusCode, statusMessage, headers);
    res.end(body);
  },
  balance: async (res, addressType, address) => {
    try {
      // perform balance request
      const isTag = Boolean(addressType === 'tag');
      const le = await Mochimo.getBalance(process.env.CUSTOMNODE, address, isTag);
      // send successfull query or 404
      return Responder._respond(res, le ? 200 : 404, le ||
        { message: `${isTag ? 'tag' : 'wots+'} not found in ledger...` });
    } catch (error) { Responder.unknownInternal(res, error); }
  },
  block: async (res, blockNumber) => {
    try {
      // convert blockNumber parameter to Long number type
      const bnum = Mongo.util.long(blockNumber);
      // perform block query
      const block = await Mongo.findOne('block', { bnum });
      // send successfull query or 404
      return Responder._respond(res, block ? 200 : 404, block ||
        { message: `${blockNumber} could not be found...` });
    } catch (error) { Responder.unknownInternal(res, error); }
  },
  search: async (cName, res, ...args) => {
    let cursor;
    try {
      // set defaults and interpret requested search params as necessary
      const search = { query: {}, options: {} };
      Object.assign(search, Interpreter.search(args[0]));
      // query database for results
      cursor = await Mongo.find(cName, search.query, search.options);
      const results = await cursor.toArray();
      // send succesfull query or 404
      Responder._respond(res, results.length ? 200 : 404, results.length
        ? results : { message: `no results found for ${args[0]}` });
    } catch (error) { // send 500 on internal error
      Responder.unknownInternal(res, error);
    } finally { // cleanup cursor
      if (cursor && !cursor.isClosed()) await cursor.close();
    }
  },
  searchBlock: (...args) => Responder.search('block', ...args),
  searchTransaction: (...args) => Responder.search('transaction', ...args),
  transaction: async (res, txid) => {
    try {
      // perform transaction query
      const transaction = await Mongo.findOne('transaction', { txid });
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

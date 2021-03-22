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
    if (statusCode > 299 && !json.error) json.error = statusMessage;
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
    // perform balance request
    const isTag = Boolean(addressType === 'tag');
    const le = await Mochimo.getBalance(process.env.CUSTOMNODE, address, isTag);
    // send successfull query or 404
    return this._respond(res, le ? 200 : 404, le ||
      { message: `${isTag ? 'tag' : 'wots+'} not found in ledger...` });
  },
  block: async (res, blockNumber) => {
    // convert blockNumber parameter to Long number type
    const bnum = Mongo.util.long(blockNumber);
    // perform block query
    const block = await Mongo.findOne('block', { bnum });
    // send successfull query or 404
    return this._respond(res, block ? 200 : 404, block ||
      { message: `${blockNumber} could not be found...` });
  },
  search: (cName, search) => {},
  searchBlock: (...args) => this.search('block', ...args),
  searchTransaction: (...args) => this.search('transaction', ...args),
  transaction: async (res, txid) => {
    // perform transaction query
    const transaction = await Mongo.findOne('transaction', { txid });
    // send successfull query or 404
    return this._respond(res, transaction ? 200 : 404, transaction ||
      { message: `${txid} could not be found...` });
  },
  unknown: (res, code = 404, json = {}) => this._respond(res, code, json)
};

module.exports = Responder;

/**
 *  MochiMap Utilities
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
const https = require('https');

const asUint64String = (bigint) => {
  return BigInt.asUintN(64, BigInt(bigint)).toString(16).padStart(16, '0');
};

const objectIsEmpty = (obj) => {
  for (const prop in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, prop)) return false;
  }
  return true;
};

const objectDifference = (objA, objB, depth = 0) => {
  if (typeof objA !== 'object' || typeof objB !== 'object') {
    throw new TypeError('comparison parameters MUST BE objects');
  } else if (typeof depth !== 'number') {
    throw new TypeError('depth parameter CANNOT be assigned a non-number type');
  }
  return Object.entries(objB)
    .filter(([key, value]) => objA[key] !== value)
    .reduce((objC, [key, value]) => {
      if (typeof value === 'object' && typeof objA[key] === 'object') {
        if (depth - 1 !== 0) {
          value = objectDifference(objA[key], value, depth - 1);
          if (objectIsEmpty(value)) return objC;
        }
      }
      return { ...objC, [key]: value };
    }, {});
};

const fidFormat = (fid, ...args) => {
  const t = (s, m) => `${s}`.length > m ? `${s}`.slice(0, m) + '~' : `${s}`;
  const tJoin = (array, max, d) => {
    const end = array.length - 1;
    return array.reduce((a, c, i) => a + t(c, max) + (i < end ? d : ''), '');
  };
  return [fid, '(', tJoin(args, 8, ', '), '):'].join('');
};

const invalidHexString = (hexStr, name) => {
  if (typeof hexStr !== 'string') {
    // string is the only acceptable type for hexStr
    return 'invalid type, ' + name;
  } else {
    // check for remaining data after removing valid hexadecimal characters
    if (hexStr.replace(/[0-9A-Fa-f]/g, '')) return 'invalid data, ' + name;
  }
  return false;
};

const checkRequest = (req, defaults) => {
  // ensure request is an object
  if (typeof req === 'undefined') req = {};
  else if (typeof req !== 'object') return 'invalid request parameter';
  // check defaults
  const defaulted = {};
  if (typeof defaults !== 'undefined') {
    if (typeof defaults !== 'object') throw new Error('Invalid defaults usage');
    for (const [key, value] of Object.entries(defaults)) {
      // apply defaults if possible
      if (typeof req[key] === 'undefined') {
        if (value !== null && !Array.isArray(value)) {
          // indicate if default has been applied or not
          defaulted[key] = true;
          req[key] = value;
        } else return 'missing default, ' + key;
      }
      // if "value" is Array, request[key] MUST include one of "value" items
      if (Array.isArray(value)) {
        if (!value.includes(req[key])) {
          return 'invalid default, ' + key;
          // else indicate if checked against defaults
        } else defaulted[key] = true;
      }
    }
  }
  // for remaining request properies, check and enforce acceptable values
  if (typeof req.address !== 'undefined' && !defaulted.address) {
    const invalid = invalidHexString(req.address, 'address');
    if (invalid) return invalid;
    // addr must be a hexadecimal string of length > 1
    if (req.address.length < 2) return 'insufficient address length';
  }
  if (typeof req.bhash !== 'undefined' && !defaulted.bhash) {
    const invalid = invalidHexString(req.bhash, 'bhash');
    if (invalid) return invalid;
  }
  if (typeof req.bnum !== 'undefined' && !defaulted.bnum) {
    const valid = ['bigint', 'number', 'string'];
    if (!valid.includes(typeof req.bnum)) return 'invalid type, bnum';
    try {
      // force BigInt value for bnum
      req.bnum = BigInt(req.bnum);
    } catch (ignore) { return 'invalid data, bnum'; }
  }
  if (typeof req.depth !== 'undefined' && !defaulted.depth) {
    const valid = ['number', 'string'];
    if (!valid.includes(typeof req.depth)) return 'invalid type, depth';
    try {
      // force Number value for depth
      req.depth = Number(req.depth);
    } catch (ignore) { return 'invalid data, depth'; }
  }
  if (typeof req.addressType !== 'undefined' && !defaulted.addressType) {
    if (typeof req.addressType !== 'string') {
      // string is the only acceptable type for req.type
      return 'invalid type, type';
    } else {
      // check for remaining data after removing valid alpha-characters
      if (req.addressType.replace(/[A-Fa-f]/g, '')) return 'invalid data, type';
    }
  }
  // all known properties are clean
  return false;
};

const compareWeight = (weight1, weight2) => {
  // ensure both strings are equal length
  const maxLen = Math.max(weight1.length, weight2.length);
  weight1 = weight1.padStart(maxLen, '0');
  weight2 = weight2.padStart(maxLen, '0');
  // return 1 (a > b), -1 (a < b) or 0 (a == b)
  if (weight1 > weight2) return 1;
  if (weight1 < weight2) return -1;
  return 0;
};

const isPrivateIPv4 = (ip) => {
  const b = new ArrayBuffer(4);
  const c = new Uint8Array(b);
  const dv = new DataView(b);
  if (typeof ip === 'number') dv.setUint32(0, ip, true);
  if (typeof ip === 'string') {
    const a = ip.split('.');
    for (let i = 0; i < 4; i++) dv.setUint8(i, a[i]);
  }
  if (c[0] === 0 || c[0] === 127 || c[0] === 10) return 1; // class A
  if (c[0] === 172 && (c[1] & 0xff) >= 16 && (c[1] & 0xff) <= 31) {
    return 2; // class B
  }
  if (c[0] === 192 && (c[1] & 0xff) === 168) return 3; // class C
  if (c[0] === 169 && (c[1] & 0xff) === 254) return 4; // auto
  return 0; // public IP
};

const readWeb = (options, postData) => {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let body = [];
      res.on('data', chunk => body.push(chunk)); // accumulate data chunks
      res.on('end', () => { // concatenate data chunks
        body = Buffer.concat(body).toString();
        try { // pass JSON Object
          resolve(JSON.parse(body));
        } catch (ignore) { resolve(body); }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
};

const informedShutdown = (signal, origin = 'unknown') => {
  console.error(`\n// SHUTDOWN: recv'd ${signal} from ${origin}`);
  process.exit(Number(signal) || 1);
};

const ms = {
  second: 1000,
  minute: 60000,
  hour: 3600000,
  day: 86400000,
  week: 604800000
};

module.exports = {
  asUint64String,
  objectDifference,
  objectIsEmpty,
  fidFormat,
  checkRequest,
  compareWeight,
  isPrivateIPv4,
  readWeb,
  informedShutdown,
  ms
};

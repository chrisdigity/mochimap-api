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

const cleanRequest = (req) => {
  // confirm req is an object
  if (typeof req !== 'object') return 'invalid request';
  // for every known request property, check and enforce acceptable types
  if (req.bnum) {
    const valid = ['bigint', 'number', 'string'];
    if (!valid.includes(typeof req.bnum)) return 'invalid type, bnum';
    try {
      // force BigInt value for bnum
      req.bnum = BigInt(req.bnum);
    } catch (ignore) { return 'invalid data, bnum'; }
  }
  if (req.bhash) {
    if (typeof req.bhash !== 'string') {
      // string is the only acceptable type for bhash
      return 'invalid type, bhash';
    } else {
      const copy = req.bhash.repeat(1); // force string copy
      // check for remaining data after removing valid hexadecimal characters
      if (copy.replace(/[0-9A-Fa-f]/g, '')) {
        return 'invalid data, bhash';
      }
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

const request = (mod, options, postData) => {
  return new Promise((resolve, reject) => {
    var req = mod.request(options, res => {
      var body = [];
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

module.exports = { cleanRequest, compareWeight, isPrivateIPv4, request };

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
  if (typeof req !== 'object') return 'invalid request parameter';
  // for every known request property, check and enforce acceptable types
  if (req.activities) {
    if (!Array.isArray(req.activities)) {
      // activities must be an array of strings
      return 'invalid type, activities';
    } else {
      // the only acceptable data type for array contents is a string
      const len = req.activities.length;
      for (let i = 0; i < len; i++) {
        if (typeof req.activities[i] !== 'string') {
          return 'invalid type, activities[' + i + ']';
        }
        const copy = req.activities[i].repeat(1); // force string copy
        // check for remaining data after removing valid lowercase characters
        if (copy.replace(/[a-z]/g, '')) {
          return 'invalid data, activities[' + i + ']';
        }
      }
    }
  }
  if (req.bhash) {
    if (typeof req.bhash !== 'string') {
      // string is the only acceptable type for bhash
      return 'invalid type, bhash';
    } else {
      const copy = req.bhash.repeat(1); // force string copy
      // check for remaining data after removing valid hexadecimal characters
      if (copy.replace(/[0-9A-Fa-f]/g, '')) return 'invalid data, bhash';
    }
  }
  if (req.bnum) {
    const valid = ['bigint', 'number', 'string'];
    if (!valid.includes(typeof req.bnum)) return 'invalid type, bnum';
    try {
      // force BigInt value for bnum
      req.bnum = BigInt(req.bnum);
    } catch (ignore) { return 'invalid data, bnum'; }
  }
  if (req.count) {
    const valid = ['bigint', 'number', 'string'];
    if (!valid.includes(typeof req.count)) return 'invalid type, count';
    try {
      // force Number value for count
      req.count = Number(req.count);
    } catch (ignore) { return 'invalid data, count'; }
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

// Block functions
const summarizeBlock = (block) => {
  const summary = {};
  // add hash data
  summary.bhash = block.bhash;
  summary.phash = block.phash;
  // add mining data, if available
  const maddr = block.maddr;
  if (maddr) {
    summary.mroot = block.mroot;
    summary.nonce = block.nonce;
    summary.haiku = block.haiku;
    summary.maddr = maddr.slice(0, 64); // reduce mining address to 32 bytes
    summary.mreward = block.mreward;
    summary.mfee = block.mfee;
    summary.tcount = block.tcount;
  }
  const tamount = block.tamount;
  if (tamount) summary.tamount = tamount;
  // add remaining trailer data
  summary.difficulty = block.difficulty;
  summary.time0 = block.time0;
  summary.stime = block.stime;
  summary.bnum = block.bnum;
  // add block type as string
  summary.type = block.typeStr;
  // add block size, in byte
  summary.size = block.byteLength;
  // return finalized summary
  return summary;
};
const summarizeTXEntry = (txe, bnum, bhash) => {
  const summary = {
    src: txe.srctag || txe.srcaddr.slice(0, 32),
    dst: txe.dsttag || txe.dstaddr.slice(0, 32),
    chg: txe.chgtag || txe.chgaddr.slice(0, 32),
    sendtotal: txe.sendtotal,
    changetotal: txe.changetotal,
    txfee: txe.txfee,
    txsig: txe.txsig.slice(0, 32),
    txid: txe.txid.slice(0, 32)
  };
  // add bhash and bnum, if available
  if (bhash) summary.bhash = bhash;
  if (bnum) summary.bnum = bnum;
  // return finalized summary
  return summary;
};
const visualizeHaiku = async (haiku, requestModule) => {
  // heuristically determine best picture query for haiku
  const search = haiku.match(/((?<=[ ]))\w+((?=\n)|(?=\W+\n)|(?=\s$))/g);
  const query = search.join('%20');
  let pexels;
  try { // request results from Pexels
    pexels = await request(requestModule, {
      hostname: 'api.pexels.com',
      path: `/v1/search?query=${query}&per_page=80`,
      headers: { Authorization: process.env.PEXELS_SECRET }
    });
    if (pexels.error) throw new Error(pexels.error);
  } catch (error) { console.trace('Pexels request ERROR:', pexels, error); }
  // check results exist
  if (!pexels.error && pexels) {
    let pi, ps, is;
    const ts = haiku.match(/\b\w{3,}\b/g);
    for (let i = pi = ps = is = 0; i < pexels.photos.length; i++, is = 0) {
      ts.forEach(t => {
        is += (pexels.photos[i].url.match(new RegExp(t, 'g')) || []).length;
      });
      if (is > ps) { ps = is; pi = i; }
    }
    const photo = pexels.photos[pi];
    const data = { img: {} };
    data.img.author = photo.photographer || 'Unknown';
    data.img.authorurl = photo.photographer_url || 'pexels.com';
    data.img.desc = photo.url.match(/\w+(?=-)/g).join(' ');
    data.img.src = photo.src.original;
    data.img.srcid = 'Pexels';
    data.img.srcurl = photo.url;
    // return stringified JSON
    return data;
  }
  throw new Error('failed to visualize Haiku');
};

module.exports = {
  cleanRequest,
  compareWeight,
  isPrivateIPv4,
  request,
  summarizeBlock,
  summarizeTXEntry,
  visualizeHaiku
};

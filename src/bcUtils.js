/**
 *  bcUtils.js; MochiMap Blockchain Utilities
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

const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { asUint64String, readWeb } = require('./apiUtils');
const Db = require('./apiDatabase');
const Mochimo = require('mochimo');

const buildBlockDocument = (block) => {
  // expose bnum and bhash from block data
  const { bnum, bhash } = block;
  // prepend _id to minified block as JSON
  const _id = Db.util.id.block(bnum, bhash);
  const blockJSON = Object.assign({ _id }, block.toJSON(true));
  // return BigInt filtered blockJSON as block document
  return Db.util.filterBigInt(blockJSON);
};

const buildLedgerDocument = (block, srcdir) => {
  // expose bnum, bhash and stime from block data
  const { bnum, bhash, stime } = block;
  // ensure block type is NEOGENESIS, before proceeding
  if (block.type !== Mochimo.Block.NEOGENESIS) return;
  // obtain previous neogenesis block data
  const pngfname = path.join(srcdir, `b${asUint64String(bnum - 256n)}.bc`);
  const pngdata = fs.readFileSync(pngfname);
  // perform pre-checks on previous neogenesis block data
  if (typeof pngdata !== 'object') {
    throw new TypeError(`"pngdata" is not an object: ${typeof pngdata}`);
  } else if (!pngdata.length >= Mochimo.BlockTrailer.length + 4) {
    throw new Error(`"pngdata.length" is insufficient: ${pngdata.length}`);
  }
  // interpret pngdata as block and perform block hash verification check
  const pngblock = new Mochimo.Block(pngdata);
  if (!pngblock.verifyBlockHash()) {
    throw new Error('"pngblock" hash could not be verified');
  }
  // create list of previous address balances (prioritise Tags for id)
  const pngaddr = {};
  const pngledger = pngblock.ledger;
  for (const lentry of pngledger) {
    let { address } = lentry;
    const { balance, tag } = lentry;
    const addressHash = createHash('sha256').update(address).digest('hex');
    const byte = Number('0x' + tag.slice(0, 2));
    const id = Mochimo.UNTAGGED_BYTES.includes(byte) ? addressHash : tag;
    address = address.slice(0, 64);
    pngaddr[id] = { address, addressHash, tag, balance, delta: -(balance) };
  }
  // build ledger JSON, as array of documents where address balances have deltas
  const ledgerJSON = [];
  const ledgerPush = { bhash, timestamp: stime, bnum };
  // scan current neogenesis block and compare to previous
  for (const lentry of block.ledger) {
    // get appropriate address/balance and check for a change in balance
    let { address } = lentry;
    const { balance, tag } = lentry;
    const addressHash = createHash('sha256').update(address).digest('hex');
    const byte = Number('0x' + tag.slice(0, 2));
    const id = Mochimo.UNTAGGED_BYTES.includes(byte) ? addressHash : tag;
    const pbalance = pngaddr[id] ? pngaddr[id].balance : 0n;
    if (pbalance !== balance) {
      // push balance delta and details to ledgerJSON
      const delta = balance - pbalance;
      const _id = Db.util.id.ledger(bnum, bhash, id);
      address = address.slice(0, 64);
      Object.assign(ledgerPush, { address, addressHash, tag, balance, delta });
      ledgerJSON.push(Object.assign({ _id }, ledgerPush));
    }
    // remove entry from previous cache
    delete pngaddr[id];
  }
  // process remaining pngaddr as emptied
  for (const [id, details] of Object.entries(pngaddr)) {
    // push balance delta as 0 balance address to ledgerJSON
    details.balance = 0n;
    const _id = Db.util.id.ledger(bnum, bhash, id);
    ledgerJSON.push(Object.assign({ _id }, Object.assign(ledgerPush, details)));
  }
  // return BigInt filtered ledgerJSON as array of ledger documents
  return Db.util.filterBigInt(ledgerJSON);
};

const buildTransactionDocument = (block) => {
  // expose bnum, bhash and stime from block data
  const { bnum, bhash, stime } = block;
  // ensure block type is NORMAL, before proceeding
  if (block.type !== Mochimo.Block.NORMAL) return;
  // obtain and format transactions in transactionJSON
  const transactionJSON = block.transactions.map(txe => {
    // prepend _id, stime, bnum and bhash to minified txe
    const _id = Db.util.id.transaction(bnum, bhash, txe.txid);
    return Object.assign({ _id, stime, bnum, bhash }, txe.toJSON(true));
  });
  // push mining reward as extra transaction
  const txe = { dstaddr: block.maddr.slice(0, 64), sendtotal: block.mreward };
  const _id = Db.util.id.block(bnum, bhash) + '-mreward';
  transactionJSON.push(Object.assign({ _id, stime, bnum, bhash }, txe));
  // return BigInt filtered transactionJSON as array of transaction documents
  return Db.util.filterBigInt(transactionJSON);
};

const processBlock = async (data, srcdir) => {
  let logstr = '';
  // perform pre-checks on data
  if (typeof data !== 'object') {
    throw new TypeError(`"data" is not an object: ${typeof data}`);
  } else if (!data.length >= Mochimo.BlockTrailer.length + 4) {
    throw new Error(`"data.length" is insufficient: ${data.length}`);
  }
  // interpret data as Mochimo Block and perform block hash verification check
  const block = new Mochimo.Block(data);
  if (!block.verifyBlockHash()) {
    throw new Error('"block" hash could not be verified');
  }
  // check database for existing store
  const _id = Db.util.id.block(block.bnum, block.bhash);
  if (!(await Db.has('block', block.bnum, block.bhash))) {
    try {
      // build block component documents
      const docs = {
        block: buildBlockDocument(block),
        ledger: buildLedgerDocument(block, srcdir),
        transaction: buildTransactionDocument(block)
      };
      // insert applicable documents and log results
      for (const [col, doc] of Object.entries(docs)) {
        if (doc) logstr += `${await Db.insert(col, doc)} ${col} / `;
      }
    } catch (error) { logstr += '' + error; }
  } else logstr = 'database entry found';
  console.log(_id.replace(/^0+/, '0x').slice(0, -8) + ';', logstr);
  // return block identifier (_id)
  return _id;
};

const visualizeHaiku = async (haiku, shadow) => {
  const algo = (arr, ...comp) => { // condensed heuristic algorithm
    let pi, ps, is, str;
    const ts = haiku.match(/\b\w{3,}\b/g).map(t => new RegExp(t, 'g'));
    for (let i = pi = ps = is = 0; i < arr.length; i++, is = 0, str = '') {
      for (const app of comp) str += ' ' + arr[i][app];
      for (const reg of ts) is += (str.match(reg) || []).length;
      if (is > ps) { ps = is; pi = i; }
    } return { photo: arr[pi], ps };
  };
  // heuristically determine best picture query for haiku
  const search = haiku.match(/((?<=[ ]))\w+((?=\n)|(?=\W+\n)|(?=\s$))/g);
  const query = search.join('%20');
  const data = { img: { haiku, shadow } };
  let results;
  try { // request results from Pexels
    results = await readWeb({
      hostname: 'api.pexels.com',
      path: `/v1/search?query=${query}&per_page=80`,
      headers: { Authorization: process.env.PEXELS }
    }); // apply algorithm or throw error
    if (results.photos && results.photos.length) {
      const sol = algo(results.photos, 'url');
      if (!data.sol || data.sol.ps > sol.ps) {
        data.sol = sol; // derive pexels photo data
        data.img.author = sol.photo.photographer || 'Unknown';
        data.img.authorurl = sol.photo.photographer_url || 'pexels.com';
        data.img.desc = sol.photo.url.match(/\w+(?=-)/g).join(' ');
        data.img.src = sol.photo.src.large;
        data.img.srcid = 'Pexels';
        data.img.srcurl = sol.photo.url;
        data.img.thumb = sol.photo.src.tiny;
      }
    } else throw new Error(results.error || 'no "photos" in results');
  } catch (error) { console.trace('Pexels request ERROR:', error); }
  try { // request results from Unsplash
    results = await readWeb({
      hostname: 'api.unsplash.com',
      path: `/search/photos?query=${query}&per_page=30`,
      headers: { Authorization: 'Client-ID ' + process.env.UNSPLASH }
    }); // apply algorithm or throw error
    if (results.results && results.results.length) {
      const sol = algo(results.results, 'description', 'alt_description');
      if (!data.sol || data.sol.ps > sol.ps) {
        data.sol = sol; // derive pexels photo data
        data.img.author = sol.photo.user.name || 'Unknown';
        data.img.authorurl = sol.photo.user.links.html || 'unsplash.com';
        data.img.desc = sol.photo.description;
        data.img.src = sol.photo.urls.regular;
        data.img.srcid = 'Unsplash';
        data.img.srcurl = sol.photo.links.html;
        data.img.thumb = sol.photo.urls.thumb;
      }
    } else throw new Error(results.errors || 'no "results" in results');
  } catch (error) { console.trace('Unsplash request ERROR:', error); }
  // throw error on no solution
  if (!data.sol) throw new Error('failed to visualize Haiku');
  delete data.sol;
  return data;
};

module.exports = {
  buildBlockDocument,
  buildLedgerDocument,
  buildTransactionDocument,
  processBlock,
  visualizeHaiku
};

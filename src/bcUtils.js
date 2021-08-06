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
const TRACE = console.trace;

const processRichlist = async (data) => {
  if (!data || process.env.DISABLEBCRICHLIST) return;
  // expose bnum, bhash and ledger from data
  let { ledger } = data;
  const { bnum, bhash } = data;
  const _bid = Db.util.id.block(bnum, bhash);
  // build ledger JSON, as array of ranked ledger entries (BigInt filtered)
  ledger = Db.util.filterBigInt(ledger.sort((a, b) => {
    return Number(b.balance - a.balance); // ~1 minute for ~10 million entries
  }).map((lentry, index, array) => {
    let { address } = lentry;
    const { balance, tag } = lentry;
    const rank = index + 1;
    const dbrank = array.length - rank;
    const addressHash = createHash('sha256').update(address).digest('hex');
    const _id = Db.util.id.ledger(bnum, bhash, asUint64String(dbrank));
    address = address.slice(0, 64);
    return { _id, address, addressHash, tag, balance, rank };
  }));
  // log database insert; array of ranked ledger entries
  const res = await Db.insert('richlist', ledger);
  console.log(_bid.replace(/^0{0,15}/, '0x').slice(0, -8), res, 'x Richlist');
};

const processLedger = async (block, srcdir) => {
  if (process.env.DISABLEBCLEDGER) return;
  // expose bnum, bhash and stime from block data
  const { bnum, bhash, stime } = block;
  const _bid = Db.util.id.block(bnum, bhash);
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
  const ledgerPush = { bhash, timestamp: stime, bnum };
  let ledgerJSON = [];
  // obtain ledger list for scanning (and later richlist processing)
  const { ledger } = block;
  // scan current neogenesis block and compare to previous
  for (const lentry of ledger) {
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
  // filter BigInt from ledgerJSON
  ledgerJSON = Db.util.filterBigInt(ledgerJSON);
  // log database insert; array of ledger balance deltas
  const res = await Db.insert('ledger', ledgerJSON);
  console.log(_bid.replace(/^0{0,15}/, '0x').slice(0, -8), res, 'x Ledger');
  // return ledger list for further processing
  return { bnum, bhash, ledger };
};

const processTransactions = async (block) => {
  if (process.env.DISABLEBCTRANSACTIONS) return;
  // expose bnum, bhash and stime from block data
  const { bnum, bhash, stime, maddr, mreward } = block;
  const _bid = Db.util.id.block(bnum, bhash);
  // obtain and format transactions in transactionArray
  const { transactions } = block;
  let transactionJSON = transactions.map(txe => {
    // prepend _id, stime, bnum and bhash to minified txe
    const _id = Db.util.id.transaction(bnum, bhash, txe.txid);
    return Object.assign({ _id, stime, bnum, bhash }, txe.toJSON(true));
  });
  const operations = [...transactions.map((txe) => {
    // insert transaction as minified txe...
    const _id = Db.util.id.transaction(bnum, bhash, txe.txid);
    return { // ... prepended with _id, stime, bnum and bhash
      insertOne: { document: { _id, stime, bnum, bhash, ...txe.toJSON(true) } }
    };
  }), ...transactions.map((txe) => {
    // delete mempool recorded transactions found in this block
    const _id = Db.util.id.mempool(-1, -1, txe.txid);
    return { deleteOne: { filter: { _id } } };
  })];
  // push mining reward as extra transaction
  const txe = { dstaddr: block.maddr.slice(0, 64), sendtotal: block.mreward };
  const _id = Db.util.id.block(bnum, bhash) + '-mreward';
  const doc = { _id, stime, bnum, bhash, maddr: maddr.slice(0, 64), mreward };
  transactionJSON.push(Object.assign({ _id, stime, bnum, bhash }, txe));
  operations.push({ insertOne: { document: doc } });
  // filter BigInt from transactionArray
  transactionJSON = Db.util.filterBigInt(transactionJSON);
  // log database insert; array of ledger balance deltas
  const res = await Db.insert('transaction', transactionJSON);
  console.log(_bid.replace(/^0{0,15}/, '0x').slice(0, -8), res, 'x Transaction');

  const memres =
    await Db.bulk('mempool', Db.util.filterBigInt(operations));
  console.log(_bid.replace(/^0{0,15}/, '0x').slice(0, -8), memres, 'x MemPool');
};

const processHaikuVisualization = async (block) => {
  if (process.env.DISABLEBCHAIKU) return;
  // expose bnum, bhash, phash and nonce from block
  let { nonce } = block;
  const { bnum, bhash, phash } = block;
  const _id = Db.util.id.block(bnum, bhash);
  // if necessary search previous blocks until there's no shadow (shadow == 0)
  let shadow = Number(block.type !== Mochimo.Block.NORMAL);
  let pblock;
  while (shadow) {
    const pbnum = (pblock ? pblock.bnum : bnum) - 1n;
    const pbhash = pblock ? pblock.phash : phash;
    const pblockid = Db.util.id.block(pbnum, pbhash);
    pblock = await Db.findOne('block', { _id: pblockid });
    if (!pblock) throw new Error('Cannot visualize haiku, missing ' + pblockid);
    nonce = pblock.nonce;
    shadow += nonce ? -1 : 1;
  }
  // return shadow to previous state as a Boolean
  shadow = Boolean(block.type !== Mochimo.Block.NORMAL);
  // expand nonce to Haiku
  const haiku = Mochimo.Trigg.expand(nonce, shadow);
  // heuristically determine best picture query for haiku
  const algo = (haiku, arr, ...comp) => { // condensed heuristic algorithm
    let pi, ps, is, str;
    const ts = haiku.match(/\b\w{3,}\b/g).map(t => new RegExp(t, 'g'));
    for (let i = pi = ps = is = 0; i < arr.length; i++, is = 0, str = '') {
      for (const app of comp) str += ' ' + arr[i][app];
      for (const reg of ts) is += (str.match(reg) || []).length;
      if (is > ps) { ps = is; pi = i; }
    } return { photo: arr[pi], ps };
  };
  const search = haiku.match(/((?<=[ ]))\w+((?=\n)|(?=\W+\n)|(?=\s$))/g);
  const query = search.join('%20');
  const data = { img: { haiku, shadow } };
  let res;
  try { // request results from Pexels
    res = process.env.PEXELS ? await readWeb({
      hostname: 'api.pexels.com',
      path: `/v1/search?query=${query}&per_page=80`,
      headers: { Authorization: process.env.PEXELS }
    }) : {}; // apply algorithm or throw error
    if (res.photos && res.photos.length) {
      const sol = algo(haiku, res.photos, 'url');
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
    } else throw new Error(res.error || 'no "photos" in results');
  } catch (error) { console.trace('Pexels request ERROR:', error); }
  try { // request results from Unsplash
    res = process.env.UNSPLASH ? await readWeb({
      hostname: 'api.unsplash.com',
      path: `/search/photos?query=${query}&per_page=30`,
      headers: { Authorization: 'Client-ID ' + process.env.UNSPLASH }
    }) : {}; // apply algorithm or throw error
    if (res.results && res.results.length) {
      const sol = algo(haiku, res.results, 'description', 'alt_description');
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
    } else throw new Error(res.errors || 'no "results" in results');
  } catch (error) { console.trace('Unsplash request ERROR:', error); }
  // return data without solution
  if (!data.sol) throw new Error('Unable to determine visualization for Haiku');
  delete data.sol;
  // apply atomic operators to document update
  const haikuUpdate = { $set: data };
  // log database update; haiku visualization data block update
  res = await Db.update('block', haikuUpdate, { _id });
  console.log(_id.replace(/^0{0,15}/, '0x').slice(0, -8), res, 'x Haiku');
};

const processBlock = async (data, srcdir) => {
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
  const { bnum, bhash } = block;
  const _id = Db.util.id.block(bnum, bhash);
  const _bid = _id.replace(/^0{0,15}/, '0x').slice(0, -8);
  if (!(await Db.has('block', bnum, bhash))) {
    // build block document and, if accepted, proceed with remaining documents
    try { // prepend _id to minified blockJSON
      const blockJSON = Object.assign({ _id }, block.toJSON(true));
      // record result of, and log, database insert; BigInt filtered block data
      const res = await Db.insert('block', Db.util.filterBigInt(blockJSON));
      console.log(_bid, res, 'x Block');
      if (res) {
        // BLOCK TYPE:
        // - GENESIS or NEOGENESIS; process ledger balance deltas and richlist
        // - NORMAL; process transactions
        switch (block.type) {
          case Mochimo.Block.GENESIS:
          case Mochimo.Block.NEOGENESIS:
            processLedger(block, srcdir).then(processRichlist).catch(TRACE);
            break;
          case Mochimo.Block.NORMAL:
            processTransactions(block).catch(TRACE);
            break;
        }
        // process haiku update regardless of block type
        processHaikuVisualization(block).catch(TRACE);
      }
    } catch (error) { console.error(_bid, error); }
  } else console.log(_bid, 'already processed');
  // return block identifier (_id)
  return _id;
};

module.exports = { processBlock };

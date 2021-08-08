#!/usr/bin/env node
/**
 *  bcProcessor.js; Mochimo Blockchain and Mempool processor for MochiMap
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
 **
 * By utilizing multiple FilesystemWatcher instances, the Blockchain Processor
 * detects changes WITHIN the "bc" (blockchain) directory for the processing of
 * blocks, and changes TO the "txclean.dat" (mempool) file for the processing
 * of transactions, before inserting relevant information into the database.
 * Information interpretted from the blockchain is stored as either validated
 * Blocks, confirmed Transactions, Ledger balance history, or Richlist data.
 * Information interpretted from the mempool is stored only as unconfirmed
 * Transactions which are removed as they become baked within validated blocks.
 */

console.log('\n// START:', __filename);

/* environment variables */
require('dotenv').config();

/* token check */
if (typeof process.env.PEXELS === 'undefined') {
  console.warn('// WARNING: Pexels token is undefined');
  console.warn('// haiku visualization will not contain Pexels images...');
}
if (typeof process.env.UNSPLASH === 'undefined') {
  console.warn('// WARNING: Unsplash token is undefined');
  console.warn('// haiku visualization will not contain Unsplash images...');
}

/* modules and utilities */
const { processBlock } = require('./bcUtils');
const FilesystemWatcher = require('./apiFilesystemWatcher');
const Db = require('./apiDatabase');
const Mochimo = require('mochimo');
const path = require('path');
const fs = require('fs');

/* filesystem configuration */
const HDIR = require('os').homedir();
const DEFAULTDIR = path.join(HDIR, 'mochimo', 'bin', 'd');
const ARCHIVEDIR = process.env.ARCHIVEDIR || path.join(HDIR, 'archive');
const BLOCKCHAINDIR = process.env.BLOCKCHAINDIR || path.join(DEFAULTDIR, 'bc');
const MEMPOOL = process.env.MEMPOOL || path.join(DEFAULTDIR, 'txclean.dat');
let MEMPOS = 0; // stores last position in MEMPATH

/* declare watcher instances */
const MempoolWatcher = new FilesystemWatcher();
const BlockchainWatcher = new FilesystemWatcher();

/* handlers */
const MempoolHandler = (stats, eventType) => {
  const time0 = Math.floor(Date.now() / 1000);
  // 'rename' events trigger MEMPOS reset ONLY; events missing stats are ignored
  if (eventType === 'rename') MEMPOS = 0;
  if (eventType === 'rename' || !stats) return;
  // determine if MEMPOOL has valid bytes to read
  const { length } = Mochimo.TXEntry;
  const { size } = stats;
  // check mempool for filesize reduction, reset MEMPOS
  if (size < MEMPOS) MEMPOS = 0;
  // ensure mempool has data
  let position = MEMPOS;
  const remainingBytes = size - position;
  if (remainingBytes) {
    // ensure remainingBytes is valid factor of TXEntry.length
    const invalidBytes = remainingBytes % length;
    if (invalidBytes) { // report error in position or (likely) filesize
      const details = { size, position, remainingBytes, invalidBytes };
      return console.trace(`MEMPOOL invalid, ${JSON.stringify(details)}`);
    } else MEMPOS = size; // adjust MEMPOS to size
    // obtain mempool filehandle
    let filehandle;
    fs.promises.open(MEMPOOL).then((handle) => {
      filehandle = handle; // store handle and read chunk of data into buffer
      return handle.read({ buffer: Buffer.alloc(remainingBytes), position });
    }).then((result) => {
      // ensure sufficient bytes were read
      if (result.bytesRead !== remainingBytes) {
        const details = JSON.stringify({ position, result });
        throw new Error(`Insufficient Mempool bytes read, ${details}`);
      } // interpret 'length' segments of bytes as TXEntry's
      for (position = 0; position < remainingBytes; position += length) {
        const txebuffer = result.buffer.slice(position, position + length);
        const txentry = new Mochimo.TXEntry(txebuffer);
        const txid = txentry.txid;
        const _txid = txid.slice(0, 8);
        const _id = Db.util.id.transaction(-1, -1, txid);
        // check database for existing transaction entry (asynchronous)
        Db.has('transaction', -1, -1, txid).then((found) => {
          if (found) return -1;
          return Db.update('transaction', Db.util.filterBigInt({
            $setOnInsert: { _id, time0, ...txentry.toJSON(true) }
            /* Using a $setOnInsert update in this manner allows us to
            * avoid an uncontrolled condition where a memProcessor synced
            * to a node from one server inserts an unconfirmed transaction
            * AFTER the same confirmed transaction is inserted by a
            * bcProcessor synced to a node from another server. */
          }), { txid }, { upsert: true });
        }).then((result) => {
          if (result > 0) return console.log('TxID', _txid, 'processed!');
          if (result === 0) return console.log('TxID', _txid, 'denied...');
          return console.log('TxID', _txid, 'already exists...');
        }).catch((error) => { console.error(_txid, error); });
      } // end for (position...
    }).catch(console.trace).finally(() => {
      // ensure filehandle gets closed
      if (filehandle) filehandle.close();
    }); // end fs.promises.open... catch... finally...
  } // end if (remainingBytes...
}; // end const fileHandler...

const BlockchainHandler = (stats, eventType, filename) => {
  // accept only 'rename' events where filename extension is '.bc'
  if (filename && filename.endsWith('.bc') && eventType === 'rename') {
    const bcpath = path.join(BLOCKCHAINDIR, filename);
    let blockdata;
    // check 'renamed' filename is accessible then read
    fs.promises.access(bcpath, fs.constants.R_OK).then(() => {
      return fs.promises.readFile(bcpath);
    }).then((data) => { // file read successfull, process block data
      blockdata = data;
      return processBlock(data, BLOCKCHAINDIR);
    }).then((bid) => { // processBlock returns block ID on valid block
      if (bid) filename = bid;
    }).catch((error) => { // error occured during file access/read/process
      if (error.code !== 'ENOENT') console.error(filename, '::', error);
    }).finally(() => { // archive block data to archive directory
      if (blockdata) {
        const archivepath = path.join(ARCHIVEDIR, filename);
        fs.promises.mkdir(ARCHIVEDIR, { recursive: true }).then(() => {
          return fs.promises.writeFile(archivepath, blockdata);
        }).catch((error) => {
          console.error('// ARCHIVE: failure,', filename, '::', error);
        }); // end fs.promises.mkdir... catch...
      } // end if (blockdata...
    }); // end }).finally...
  } // end if (filename...
}; // end const fileHandler...

/* initialize watchers */
MempoolWatcher.init(MEMPOOL, MempoolHandler);
BlockchainWatcher.init(BLOCKCHAINDIR, BlockchainHandler);

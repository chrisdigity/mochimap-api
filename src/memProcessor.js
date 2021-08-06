#!/usr/bin/env node
/**
 *  memProcessor.js; Mochimo mempool processor for MochiMap
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
 * By utilizing the FilesystemWatcher, the Mempool Processor detects changes in
 * a mempool file (txclean.dat) and inserts them into the transaction database
 * as unconfirmed transactions. Operating separately, the Blockchain Processor
 * upserts transactions as they are baked into blocks, updating transactions
 * with confirmation details or leaving them unconfirmed.
 */

console.log('\n// START:', __filename);

/* environment variables */
require('dotenv').config();

/* modules and utilities */
const FilesystemWatcher = require('./apiFilesystemWatcher');
const Db = require('./apiDatabase');
const Mochimo = require('mochimo');
const path = require('path');
const fs = require('fs');

/* filesystem configuration */
const HDIR = require('os').homedir();
const MEMDIR = path.join(HDIR, 'mochimo', 'bin', 'd');
const MEMPOOLPATH = path.join(MEMDIR, process.env.MEMPOOL || 'txclean.dat');
let MEMPOS = 0; // stores last position in MEMPATH

/* declare watcher instance */
const Watcher = new FilesystemWatcher();

/* routines */
const fileHandler = async (stats, eventType) => {
  // 'rename' events trigger MEMPOS reset ONLY; events missing stats are ignored
  if (eventType === 'rename') MEMPOS = 0;
  if (eventType === 'rename' || !stats) return;
  let filehandle; // declare file handle for reading mempool
  try { // determine if MEMPOOL has valid bytes to read
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
        throw new Error(`MEMPOOL invalid, ${JSON.stringify(details)}`);
      } else MEMPOS = size; // adjust MEMPOS to size
      // obtain mempool filehandle
      filehandle = await fs.promises.open(MEMPOOLPATH);
      // read chunk of data into buffer
      const buffer = Buffer.alloc(remainingBytes);
      const result = await filehandle.read({ buffer, position });
      // ensure sufficient bytes were read
      if (result.bytesRead !== remainingBytes) {
        const details = JSON.stringify({ position, result });
        throw new Error(`Insufficient Mempool bytes read, ${details}`);
      } // interpret 'length' segments of bytes as TXEntry's
      for (position = 0; position < remainingBytes; position += length) {
        const txebuffer = result.buffer.slice(position, position + length);
        const txentry = new Mochimo.TXEntry(txebuffer);
        const txid = txentry.txid;
        const _id = Db.util.id.transaction(-1, -1, txid);
        try { // update database with transaction entry
          if (!(await Db.has('transaction', -1, -1, txid))) {
            const updateArgs = [ // arguments for Db.update operation
              Db.util.filterBigInt({ // BigInt filtered update
                $setOnInsert: { _id, ...txentry.toJSON(true) }
                /* Using a $setOnInsert update in this manner allows us to
                 * avoid an uncontrolled condition where a memProcessor synced
                 * to a node from one server inserts an unconfirmed transaction
                 * AFTER the same confirmed transaction is inserted by a
                 * bcProcessor synced to a node from another server. */
              }), { txid }, { upsert: true } // query and options
            ]; // setOnInsert txentry JSON to transaction database
            if (await Db.updateAll('transaction', ...updateArgs)) {
              console.log('TxID', txid.slice(0, 8), 'processed!');
            } else console.log('TxID', txid.slice(0, 8), 'denied...');
          } else console.log('TxID', txid.slice(0, 8), 'already exists...');
        } catch (error) { console.error(txid.slice(0, 8), error); }
      } // end for (position...
    } // end if (remainingBytes...
  } catch (error) { // trace error for troubleshooting
    console.trace(error);
  } finally { // ensure filehandle is closed after use
    if (filehandle) await filehandle.close();
  } // end try... catch... finally...
}; // end const fileHandler...

/* initialize watcher */
Watcher.init(MEMPOOLPATH, fileHandler);

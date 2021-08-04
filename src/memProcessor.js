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
  // ignore 'rename' events or events missing stats object
  if (!stats || eventType === 'rename') return;
  let filehandle; // declare file handle for reading mempool
  try { // determine if MEMPOOL has valid bytes to read
    const { length } = Mochimo.TXEntry;
    const { size } = stats;
    // check mempool for filesize reduction, reset MEMPOS
    if (size < MEMPOS) MEMPOS = 0;
    // ensure mempool has data
    let remainingBytes = size - MEMPOS;
    if (remainingBytes) {
      // ensure remainingBytes is valid factor of TXEntry.length
      const invalidBytes = remainingBytes % length;
      if (invalidBytes) { // report error in MEMPOS or (likely) filesize
        const details = { size, MEMPOS, remainingBytes, invalidBytes };
        return console.error(`MEMPOOL invalid, ${JSON.stringify(details)}`);
      } // otherwise, open mempool for reading
      filehandle = await fs.promises.open(MEMPOOLPATH);
      for (; remainingBytes; MEMPOS += length, remainingBytes -= length) {
        const buffer = Buffer.alloc(length);
        // read from filehandle "TXEntry.length" bytes, into buffer
        const result = await filehandle.read({ buffer, MEMPOS });
        if (result.bytesRead === length) { // sufficient bytes were read
          // build JSON TXEntry
          const txentry = new Mochimo.TXEntry(result.buffer);
          const _txid = Db.util.id.mempool(txentry.txid);
          if (!(await Db.has('mempool', txentry.txid))) {
            try { // insert txentry JSON in mempool
              const insertDoc = { _id: _txid, ...txentry.toJSON(true) };
              await Db.insert('mempool', Db.util.filterBigInt(insertDoc));
              console.log(_txid.slice(0, 16), ': processed');
            } catch (error) { console.error(_txid.slice(0, 16), error); }
          } else console.log(_txid.slice(0, 16), 'already processed');
        } else { // otherwise, report error in read result
          const details = { MEMPOS, result };
          console.error('insufficient txentry bytes,', JSON.stringify(details));
        } // end if (result.bytesRead...
      } // end for (; remainingBytes...
    } // end if (remainingBytes...
  } catch (error) {
    // trace error for troubleshooting
    console.trace(error);
  } finally {
    // ensure filehandle is closed after use
    if (filehandle) await filehandle.close();
  } // end try... catch... finally...
}; // end const fileHandler...

/* initialize watcher */
Watcher.init(MEMPOOLPATH, fileHandler);

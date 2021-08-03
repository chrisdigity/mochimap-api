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
const {
  informedShutdown, ms
} = require('./apiUtils');
const Db = require('./apiDatabase');
const Mochimo = require('mochimo');
const path = require('path');
const fs = require('fs');

/* filesystem configuration */
const HDIR = require('os').homedir();
const MEMDIR = path.join(HDIR, 'mochimo', 'bin', 'd');
const MEMPOOLPATH = path.join(MEMDIR, process.env.MEMPOOL || 'txclean.dat');
let MEMPOS = 0; // stores last position in MEMPATH

/* routines */
const fileHandler = async (stats) => {
  if (!stats) return; // ignore events with missing "current" stats object
  let filehandle; // declare file handle for reading mempool
  try { // determine if MEMPOOL has valid bytes to read
    const { length } = Mochimo.TXEntry;
    const { size } = stats;
    // check mempool for filesize reduction, reset MEMPOS
    if (size < MEMPOS) MEMPOS = 0;
    let position = MEMPOS;
    // ensure mempool has data
    let remainingBytes = size - position;
    if (remainingBytes) {
      // ensure remainingBytes is valid factor of TXEntry.length
      const invalidBytes = remainingBytes % length;
      if (invalidBytes) { // report error in position or (likely) filesize
        const details = { size, position, invalidBytes };
        return console.error(`MEMPOOL invalid, ${JSON.stringify(details)}`);
      } // otherwise, open mempool for reading
      filehandle = await fs.promises.open(MEMPOOLPATH);
      for (; remainingBytes; position += length, remainingBytes -= length) {
        const buffer = Buffer.alloc(length);
        // read from filehandle "TXEntry.length" bytes, into buffer
        const result = await filehandle.read({ buffer, position });
        if (result.bytesRead === length) { // sufficient bytes were read
          // build JSON TXEntry
          const txentry = new Mochimo.TXEntry(result.buffer).toJSON(true);
          const _txid = Db.util.id.mempool(txentry.txid);
          if (!(await Db.has('mempool', txentry.txid))) {
            try { // insert txentry in mempool
              await Db.insert('mempool', { _id: _txid, ...txentry });
              console.log(_txid, ': processed');
            } catch (error) { console.error(_txid, error); }
          } else console.log(_txid, 'already processed');
        } else { // otherwise, report error in read result
          const details = { position, result };
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
  }
}; // end const fileHandler...

/* watcher */
const Watcher = {
  _timeout: undefined,
  init: () => {
    // check MEMPOOLPATH is readable
    fs.promises.access(MEMPOOLPATH, fs.constants.R_OK).then(() => {
      // create directory watcher
      fs.watchFile(path.join, fileHandler);
      console.log('// INIT: watcher started...');
    }).catch((error) => { // MEMPOOLPATH is unreadable, set reinit timout
      console.error('// INIT:', error);
      console.error('// INIT: failure, could not access', MEMPOOLPATH);
      console.error('// INIT: attempting restart in 60 seconds...');
      Watcher._timeout = setTimeout(Watcher.init, ms.minute);
    });
  } // end init...
}; // end const Watcher...

/* set cleanup signal traps */
const cleanup = (e, src) => {
  if (Watcher._timeout) {
    console.log('// CLEANUP: terminating watcher timeout...');
    clearTimeout(Watcher._timeout);
  }
  return informedShutdown(e, src);
};
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('uncaughtException', console.trace);

/* initialize watcher */
Watcher.init();

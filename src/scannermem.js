/**
 *  memscanner.js; Mochimo Mempool scanner for MochiMap
 *  Copyright (C) 2021-2022  Chrisdigity
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

/* modules and utilities */
const Watcher = require('./watcher');
const mochimo = require('mochimo');
const fs = require('fs');

/* Mempool Scanner */
module.exports =
class MempoolScanner extends Watcher {
  constructor ({ db, emit, target, scanOnly }) {
    // apply default target
    if (typeof target !== 'string') {
      target = '/home/mochimo-node/mochimo/bin/d/txclean.dat';
    }
    // Watcher()
    super({ name: 'MEMSCANNER', target, scanOnly });
    // apply instance parameters
    Object.assign(this, { db, emit, fp: 0, target });
  }

  handler (stats, eventType) {
    // 'rename' events trigger this.fp reset ONLY; events missing stats are ignored
    if (eventType === 'rename') this.fp = 0;
    if (eventType === 'rename' || !stats) return;
    // determine if TXCLEAN has valid bytes to read
    const { length } = mochimo.TXEntry;
    const { size } = stats;
    // check mempool for filesize reduction, reset this.fp
    if (size < this.fp) this.fp = 0;
    // ensure mempool has data
    let position = this.fp;
    const remainingBytes = size - position;
    if (remainingBytes) {
      // ensure remainingBytes is valid factor of TXEntry.length
      const invalidBytes = remainingBytes % length;
      if (invalidBytes) { // report error in position or (likely) filesize
        const details = { size, position, remainingBytes, invalidBytes };
        return console.trace(`TXCLEAN invalid, ${JSON.stringify(details)}`);
      } else this.fp = size; // adjust this.fp to size
      // obtain mempool filehandle
      let filehandle;
      fs.promises.open(this.target).then((handle) => {
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
          const txentry = new mochimo.TXEntry(txebuffer);
          const txjson = txentry.toJSON(true);
          // insert "unconfirmed" transaction to db
          if (this.db) {
            this.db.query('INSERT INTO `transaction` SET ?', txjson,
              (error) => {
                if (error) {
                  if (error.code !== 'ER_DUP_ENTRY') {
                    // report error
                    console.error(error);
                  } // else ignore
                }
              });
          }
          // return transaction in callback
          if (typeof this.emit === 'function') {
            this.emit(txjson, 'transaction');
          }
        } // end for (position...
      }).catch(console.trace).finally(() => {
        // ensure filehandle gets closed
        if (filehandle) filehandle.close();
      }); // end fs.promises.open... catch... finally...
    } // end if (remainingBytes...
  } // end handler...
};

#!/usr/bin/env node
/**
 *  bcProcessor.js; Mochimo Blockchain processor for MochiMap
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
const fs = require('fs');
const path = require('path');
const { informedShutdown, ms } = require('./apiUtils');
const { processBlock } = require('./bcUtils');

/* filesystem configuration */
const HDIR = require('os').homedir();
const BCDIR = process.env.BCDIR || path.join(HDIR, 'mochimo', 'bin', 'd', 'bc');
const ARCHIVEDIR = process.env.ARCHIVEDIR || path.join(HDIR, 'archive');

/* watcher */
const Watcher = {
  _timeout: undefined,
  init: () => {
    // check BCDIR is accessible
    fs.promises.access(BCDIR).then(() => { // create directory watcher
      fs.watch(BCDIR, (eventType, filename) => {
        // accept only 'rename' events where filename extension is '.bc'
        if (filename && filename.endsWith('.bc') && eventType === 'rename') {
          const bcpath = path.join(BCDIR, filename);
          let blockdata;
          // check 'renamed' filename is accessible then read
          fs.promises.access(bcpath, fs.constants.R_OK).then(() => {
            return fs.promises.readFile(bcpath);
          }).then((data) => { // file read successfull, process block data
            blockdata = data;
            return processBlock(data, BCDIR);
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
              });
            }
          }); // end }).finally...
        }
      }); // end fs.watch...
      console.log('// INIT: watcher started...');
    }).catch((error) => { // BCDIR is inaccessible, set reinit timout
      console.error('// INIT:', error);
      console.error('// INIT: failure, could not access', BCDIR);
      console.error('// INIT: attempting restart in 60 seconds...');
      Watcher._timeout = setTimeout(Watcher.init, ms.minute);
    });
  } // end init...
}; // end const Watcher...

/* set cleanup signal traps */
const cleanup = (e, src) => {
  console.log('// CLEANUP: terminating watcher timeout...');
  if (Watcher._timeout) clearTimeout(Watcher._timeout);
  return informedShutdown(e, src);
};
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('uncaughtException', console.trace);

/* initialize watcher */
Watcher.init();

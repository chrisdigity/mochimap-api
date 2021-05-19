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
const { informedShutdown, ms } = require('./apiUtils');
const Db = require('./apiDatabase');

/* watcher */
const Watcher = {
  _timeout: undefined,
  init: () => {
    try { // create change stream on network collection
      Db.stream('network').on('change', (changeEvent) => {
        console.log(changeEvent);
      });
    } catch (error) {
      console.error('// INIT:', error);
      console.error('// INIT: failure, could not create change stream');
      console.error('// INIT: attempting restart in 60 seconds...');
      Watcher._timeout = setTimeout(Watcher.init, ms.minute);
    }
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

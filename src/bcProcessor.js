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
const FilesystemWatcher = require('./apiFilesystemWatcher');
const { processBlock } = require('./bcUtils');
const path = require('path');
const fs = require('fs');

/* filesystem configuration */
const HDIR = require('os').homedir();
const BCDIR = process.env.BCDIR || path.join(HDIR, 'mochimo', 'bin', 'd', 'bc');
const ARCHIVEDIR = process.env.ARCHIVEDIR || path.join(HDIR, 'archive');

/* declare watcher instance */
const Watcher = new FilesystemWatcher();

/* routines */
const fileHandler = (stats, eventType, filename) => {
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
        }); // end fs.promises.mkdir... catch...
      } // end if (blockdata...
    }); // end }).finally...
  } // end if (filename...
}; // end const fileHandler...

/* initialize watcher */
Watcher.init(BCDIR, fileHandler);

/**
 *  apiFilesystemWatcher.js; Filesystem watcher for MochiMap
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

/* modules and utilities */
const path = require('path');
const fs = require('fs');

/* FilesystemWatcher */
class FilesystemWatcher {
  init (fpath = this.fpath, options = this.options, callback = this.callback) {
    // parameter forwarding for callback when undefined
    if (typeof callback === 'undefined') {
      callback = options;
      options = {};
    } // end parameter forwarding
    // parameter type checks
    if (typeof fpath !== 'string') {
      throw new Error('path parameter must be a string');
    } else if (typeof options !== 'object') {
      throw new Error('options parameter must be n object');
    } else if (typeof callback !== 'function') {
      throw new Error('callback parameter must be a function');
    } // end parameter type checks
    // initialize cleanup crew
    if (!this.cleanupInitialized) {
      this.cleanupInitialized = true;
      process.on('SIGINT', this.cleanup.bind(this));
      process.on('SIGTERM', this.cleanup.bind(this));
    } // end if (!this.cleanupInitialized...
    // store parameters in instance
    this.fpath = fpath;
    this.options = options;
    this.callback = callback;
    // declare initialization error count
    this._ecount = this._ecount || 0;
    try { // try ... perform initial stat of path
      fs.stat(this.fpath, this.handleStat.bind(this, 'init', this.fpath));
      if (!options.scanOnly) { // try ... watching for path changes
        if (this._watch) this._watch.close(); // close existing watchers
        this._watch = fs.watch(this.fpath, this.handleWatch.bind(this));
        this._watch.on('error', this.handleWatchError.bind(this));
        this._ecount = 0; // reset initialization error count
        this.log('INIT', 'watcher started...');
      } // end if (!options.scanOnly...
    } catch (error) { // an error occurred initializing watcher, report/retry
      this._ecount++; // increment initialization error count
      this.log('INIT', `reinitializing in ${this._ecount} seconds...`, error);
      this._timeout = setTimeout(this.init.bind(this), this._ecount * 1000);
    } // end try...
  } // end init...

  handleStat (eventType, filename, errstat, stats) {
    if (errstat) { // handle immediate stat error
      if (errstat.code === 'ENOENT') { // acknowledge ENOENT errors
        this.log('STAT', `ENOENT ${eventType} event on ${filename}`);
        this.handleUnwatch(eventType, filename); // unnecessary return
      } else this.error('STAT', `-> ${filename}, ${errstat}`);
    } else if (!this.handleUnwatch(eventType, filename)) {
      // handle successful stat result
      switch (true) { // check Dirent type
        case stats.isDirectory():
          if (eventType === 'init') {
            const options = { withFileTypes: true };
            return fs.readdir(this.fpath, options, this.handleDir.bind(this));
          } // end if (eventType...
        case stats.isFile(): // eslint-disable-line no-fallthrough
          return this.callback(stats, eventType, filename);
        case stats.isSymbolicLink():
        case stats.isFIFO():
        case stats.isSocket():
        case stats.isCharacterDevice():
        case stats.isBlockDevice():
          return this.error('STAT', 'Dirent must describe a file or directory');
        default: // unknown Dirent type
          return this.error('STAT', 'unknown Dirent type');
      } // end switch (true...
    } // end if (error... else...
  } // end handleStat...

  handleWatchError (error) {
    this.error('', error);
    return this.init();
  } // end handleWatch...

  handleWatch (eventType, filename) {
    fs.stat(this.fpath, this.handleStat.bind(this, eventType, filename));
  } // end handleWatch...

  handleUnwatch (eventType, filename) {
    if (eventType === 'rename' && filename === path.basename(this.fpath)) {
      this.log('STAT', 'reinitializing in 1 second...');
      this._timeout = setTimeout(this.init.bind(this), 1000);
      return true; // watch reinitialization
    } // end if (eventType === 'rename'...
    return false; // watch ok
  } // end handleUnwatch...

  handleDir (error, statsArray) {
    if (error) this.error('READDIR', error);
    else { // report on size of, and handle, statsArray
      this.log('INIT', `found ${statsArray.length} entities...`);
      for (const stats of statsArray) {
        this.handleStat.bind(this)('rename', stats.name, undefined, stats);
      } // end for...
    } // end if (err... else...
  } // end handleDir...

  log (type, message, error) {
    if (error) this.error(type, error);
    return console.log(
      `// WATCHER${type ? ` ${type}` : ''}: ${this.fpath}, ${message}`
    ); // end return...
  } // end log...

  error (type, message) {
    return console.error(
      `// WATCHER${type ? ` ${type}` : ''} ERROR: ${this.fpath}, ${message}`
    ); // end return...
  } // end error...

  cleanup () {
    if (this._watch) {
      console.log(`// CLEANUP: terminating watch on ${this.fpath} watch...`);
      this._watch.close();
    } // end _watch cleanup
    if (this._timeout) {
      console.log(`// CLEANUP: terminating ${this.fpath} watcher timeout...`);
      clearTimeout(this._timeout);
    } // end _timeout cleanup
  } // end cleanup...
} // end class FilesystemWatcher...

/* export FilesystemWatcher class */
module.exports = FilesystemWatcher;

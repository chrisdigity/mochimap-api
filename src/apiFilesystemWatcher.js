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
const fs = require('fs');

/* FilesystemWatcher */
class FilesystemWatcher {
  init (path, options, callback) {
    // parameter forwarding for callback when undefined
    if (typeof callback === 'undefined') {
      callback = options;
      options = {};
    } // end parameter forwarding
    // parameter type checks
    if (typeof path !== 'string') {
      throw new Error('path parameter must be a string');
    } else if (typeof options !== 'object') {
      throw new Error('options parameter must be n object');
    } else if (typeof callback !== 'function') {
      throw new Error('callback parameter must be a function');
    } // end parameter type checks
    // initialize cleanup crew
    if (!this.cleanupInitialized) {
      this.cleanupInitialized = true;
      process.on('SIGINT', this.cleanup);
      process.on('SIGTERM', this.cleanup);
    } // end if (!this.cleanupInitialized...
    try { // try ... perform initial stat of path
      fs.stat(path, this.handleStat.bind(this, path, 'init', null, callback));
      if (!options.scanOnly) { // try ... watching for changes on path
        fs.watch(path, this.handleWatch.bind(this, path, callback)
        ).on('error', this.reinit.bind(this, path, options, callback));
        console.log(`// INIT: ${path} watcher started...`);
      } // end if (!options.scanOnly...
    } catch (error) { // an error occurred initializing watcher, report/retry
      this.reinit(path, options, callback, error);
    } // end try...
  } // end init...

  handleStat (path, eventType, filename, callback, error, stats) {
    const logerr = (err) => console.error(`// WATCHER ERROR: ${path}, ${err}`);
    if (error) logerr(error); else {
      switch (true) { // check fs.Dirent type
        case stats.isDirectory():
          if (eventType === 'init') {
            return fs.promises.readdir(path).then((files) => {
              return files.map((file) => require('path').join(path, file));
            }).then((files) => fs.stat(files, function (err, stats) {
              if (err) logerr(err); else callback(stats, eventType, filename);
            })).catch(logerr); // end return fs.promises.readdir...
          } // end if (eventType...
        case stats.isFile(): // eslint-disable-line no-fallthrough
          return callback(stats, eventType, filename);
        case stats.isSymbolicLink():
        case stats.isFIFO():
        case stats.isSocket():
        case stats.isCharacterDevice():
        case stats.isBlockDevice():
          return logerr('Dirent must describe a file or directory');
        default: // unknown Dirent type
          return logerr('unknown Dirent type');
      } // end switch (true...
    } // end if (error... else...
  } // end handleStat...

  handleWatch (path, callback, eventType, filename) {
    fs.stat(path, this.handleStat.bind(
      this, path, eventType, filename, callback));
  } // end handleWatch...

  reinit (path, options, callback, error) {
    console.error(`// WATCHER ERROR: ${path}, ${error}`);
    console.error('// INIT: reinitializing in 60 seconds...');
    this._timeout =
      setTimeout(this.init.bind(this, path, options, callback), 60 * 1000);
  } // end reinit...

  cleanup () {
    if (!this._timeout) return;
    console.log(`// CLEANUP: terminating ${this.target} watcher timeout...`);
    clearTimeout(this._timeout);
  } // end cleanup...
} // end class FilesystemWatcher...

/* export FilesystemWatcher class */
module.exports = FilesystemWatcher;

/**
 *  watcher.js; File System Watcher for MochiMap
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
const fs = require('fs');

/* Watcher */
module.exports =
class Watcher {
  constructor ({ name, scanOnly, target }) {
    name = name || 'Watcher';
    // derive basename from target
    const basename = require('path').basename(target);
    // apply instance parameters
    Object.assign(this, { basename, name, scanOnly, target });
    // initialize "watcher"
    console.log(this.name, '// init watcher ->', this.target);
    this.init();
  } // end constructor

  cleanup () {
    if (this._watch) {
      console.log(this.name, '// terminating...');
      this._watch.close();
      this._watch = undefined;
    }
    if (this._inittimeout) {
      console.log(this.name, '// clearing timeout...');
      clearTimeout(this._inittimeout);
      this._inittimeout = undefined;
    }
  }

  init () {
    try { // perform initial stat of target
      fs.stat(this.target, this.handleStat.bind(this, 'init', this.target));
      if (!this.scanOnly) { // watch for target changes
        if (this._watch) this._watch.close(); // close existing watchers
        this._watch = fs.watch(this.target, this.handleWatch.bind(this));
        this._watch.on('error', this.handleWatchError.bind(this));
      }
    } catch (error) { // an error during init, report/retry
      this._inittimeout = setTimeout(this.init.bind(this), 5000);
      if (error.code !== 'ENOENT') {
        console.error(this.name, '// re-init in 5s...', error);
      }
    }
  }

  handleStat (eventType, filename, errstat, stats) {
    if (errstat) { // handle immediate stat error
      if (errstat.code === 'ENOENT') { // acknowledge ENOENT errors
        this.handleUnwatch(eventType, filename);
      } else console.error(this.name, `// STAT -> ${filename}`, errstat);
    } else if (!this.handleUnwatch(eventType, filename)) {
      // handle successful stat result
      switch (true) { // check Dirent type
        case stats.isDirectory():
          if (eventType === 'init') {
            const options = { withFileTypes: true };
            return fs.readdir(this.target, options, this.handleDir.bind(this));
          }
        case stats.isFile(): // eslint-disable-line no-fallthrough
          if (this.handler) return this.handler(stats, eventType, filename);
          return;
        default: // unknown Dirent type
          return console.error(this.name, '// STAT -> unknown Dirent type');
      } // end switch (true...
    } // end if (error... else...
  } // end handleStat...

  handleWatchError (error) {
    console.error(this.name, '//', error);
    return this.init();
  }

  handleWatch (eventType, filename) {
    fs.stat(this.target, this.handleStat.bind(this, eventType, filename));
  }

  handleUnwatch (eventType, filename) {
    if (eventType === 'rename' && filename === this.basename) {
      this._inittimeout = setTimeout(this.init.bind(this), 1000);
      return true; // watch reinitialization
    } else return false; // watch ok
  }

  handleDir (error, statsArray) {
    if (error) console.error(this.name, '//', error);
    else { // report on size of, and handle, statsArray
      console.log(this.name, '//', `found ${statsArray.length} entities...`);
      for (const stats of statsArray) {
        this.handleStat('rename', stats.name, undefined, stats);
      }
    }
  }
}; // end class Watcher...

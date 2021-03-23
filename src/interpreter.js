/**
 *  MochiMap Interpreter - Interprets various forms of input data for the API
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

const Parse = {
  _int: (val) => isNaN(val) ? val : parseInt(val),
  key: {
    size: this._int,
    bnum: this._int,
    time0: this._int,
    stime: this._int,
    difficulty: this._int,
    mreward: this._int,
    mfee: this._int,
    amount: this._int,
    tcount: this._int,
    lcount: this._int,
    sendtotal: this._int,
    changetotal: this._int,
    txfee: this._int
  },
  mod: {
    contains: (val) => ({ $regex: new RegExp(`.*${val}.*`) }),
    exists: (val) => ({ $exists: val === 'false' ? false : Boolean(val) }),
    gt: (val) => ({ $gt: val }),
    gte: (val) => ({ $gte: val }),
    lt: (val) => ({ $lt: val }),
    lte: (val) => ({ $lte: val }),
    ne: (val) => ({ $ne: val })
  }
};

const Interpreter = {
  search: (query) => {
    const results = { query: {}, options: { limit: 8 } };
    // remove any preceding '?'
    if (typeof query === 'string' && query) {
      if (query.startsWith('?')) query = query.slice(1);
      const parameters = query.split('&');
      for (const param of parameters) {
        let [keymod, value] = param.split('=');
        const [key, mod] = keymod.split(':');
        // parse known key and modifier queries
        if (Parse.key[key]) value = Parse.key[key](value);
        if (mod && Parse.mod[mod]) value = Parse.mod[mod](value);
        // parse known key options
        if (key === 'page' && !isNaN(value)) {
          value = parseInt(value);
          if (value > 1) results.options.skip = results.options.limit * value;
          continue;
        }
        // finally, add query
        results.query[key] = value;
      }
    }
    // return final object
    return results;
  }
};

module.exports = Interpreter;

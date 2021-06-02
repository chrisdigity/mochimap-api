/**
 *  apiInterpreter.js; Interprets input data of API requests for MochiMap
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

const ParseInt = (val) => isNaN(val) ? val : parseInt(val);
const Parse = {
  key: {
    // block integer conversions
    size: ParseInt,
    bnum: ParseInt,
    time0: ParseInt,
    stime: ParseInt,
    difficulty: ParseInt,
    mreward: ParseInt,
    mfee: ParseInt,
    amount: ParseInt,
    tcount: ParseInt,
    lcount: ParseInt,
    // network integer conversions
    port: ParseInt,
    status: ParseInt,
    // transaction integer conversions
    sendtotal: ParseInt,
    changetotal: ParseInt,
    txfee: ParseInt
  },
  mod: {
    begins: (val) => ({ $regex: new RegExp(`^${val}`) }),
    contains: (val) => ({ $regex: new RegExp(`${val}`) }),
    ends: (val) => ({ $regex: new RegExp(`${val}$`) }),
    exists: (val) => ({ $exists: val === 'false' ? false : Boolean(val) }),
    gt: (val) => ({ $gt: val }),
    gte: (val) => ({ $gte: val }),
    lt: (val) => ({ $lt: val }),
    lte: (val) => ({ $lte: val }),
    ne: (val) => ({ $ne: val })
  },
  special: {
    address: (val) => ({
      $or: [{ srcaddr: val }, { dstaddr: val }, { chgaddr: val }]
    }),
    tag: (val) => ({
      $or: [{ srctag: val }, { dsttag: val }, { chgtag: val }]
    })
  }
};

const Interpreter = {
  search: (query, paged) => {
    const results = { query: {}, options: {} };
    if (paged) results.options.limit = 8;
    // remove any preceding '?'
    if (typeof query === 'string' && query) {
      if (query.startsWith('?')) query = query.slice(1);
      const parameters = query.split('&');
      const $and = [];
      // parse search parameters
      for (let param of parameters) {
        let [keymod, value] = param.split('=');
        const [key, mod] = keymod.split(':');
        const finalKey = key.split('.').pop();
        // parse known key and modifier queries
        if (Parse.key[finalKey]) value = Parse.key[finalKey](value);
        if (mod && Parse.mod[mod]) value = Parse.mod[mod](value);
        // parse known key options
        if (paged && key === 'page' && !isNaN(value)) {
          value = parseInt(value) - 1;
          if (value) results.options.skip = results.options.limit * value;
          continue;
        }
        // expand special parameters and/or add to $and
        param = {}; // reused...
        if (Parse.special[key]) param = Parse.special[key](value);
        else param[key] = value;
        $and.push(param);
      }
      // finally, assign parameters to query
      if ($and.length) Object.assign(results.query, { $and });
    }
    // return final object
    return results;
  }
};

module.exports = Interpreter;

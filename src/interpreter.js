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
  key: {
    size: (val) => isNaN(val) ? val : parseInt(val),
    bnum: (val) => isNaN(val) ? val : parseInt(val),
    time0: (val) => isNaN(val) ? val : parseInt(val),
    stime: (val) => isNaN(val) ? val : parseInt(val),
    difficulty: (val) => isNaN(val) ? val : parseInt(val),
    mreward: (val) => isNaN(val) ? val : parseInt(val),
    mfee: (val) => isNaN(val) ? val : parseInt(val),
    amount: (val) => isNaN(val) ? val : parseInt(val),
    tcount: (val) => isNaN(val) ? val : parseInt(val),
    lcount: (val) => isNaN(val) ? val : parseInt(val),
    sendtotal: (val) => isNaN(val) ? val : parseInt(val),
    changetotal: (val) => isNaN(val) ? val : parseInt(val),
    txfee: (val) => isNaN(val) ? val : parseInt(val)
  },
  mod: {
    contains: (val) => ({ $regex: new RegExp(`.*${val}.*`) }),
    exists: (val) => ({ $exists: val === 'false' ? false : Boolean(val) }),
    gt: (val) => ({ $gt: val }),
    gte: (val) => ({ $gte: val }),
    lt: (val) => ({ $lt: val }),
    lte: (val) => ({ $lte: val }),
    ne: (val) => ({ $ne: val })
  },
  special: {
    wots: (val) => ({
      $or: [
        { srcaddr: val },
        { dstaddr: val },
        { chgaddr: val }
      ]
    }),
    tag: (val) => ({
      $or: [
        { srctag: val },
        { dsttag: val },
        { chgtag: val }
      ]
    })
  }
};

const Interpreter = {
  search: (query) => {
    const results = { query: {}, options: { limit: 8 } };
    // remove any preceding '?'
    if (typeof query === 'string' && query) {
      if (query.startsWith('?')) query = query.slice(1);
      const parameters = query.split('&');
      const $and = [];
      // parse search parameters
      for (let param of parameters) {
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
        // expand special parameters and/or add to $and
        param = {}; // reused...
        if (Parse.special[key]) param = Parse.special[key];
        else param[key] = value;
        $and.push(param);
      }
      // finally, assign parameters to query
      if ($and.length) Object.assign(results.query, { query: { $and } });
    }
    // return final object
    return results;
  }
};

module.exports = Interpreter;

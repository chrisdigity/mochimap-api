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

const Interpreter = {
  search: (query) => {
    const results = { query: {}, options: { limit: 32 } };
    // remove any preceding '?'
    if (query.startsWith('?')) query = query.slice(1);
    const parameters = query.split('&');
    for (const param of parameters) {
      let [keymod, value] = param.split('=');
      const [key, mod] = keymod.split(':');
      // check for valid options
      if (key === 'page' && !isNaN(value)) {
        value = parseInt(value);
        if (value > 1) results.options.skip = results.options.limit * value;
        continue;
      }
      // otherwise, parse query
      if (mod) {
        results[key] = {};
        results[key][`$${mod}`] = value;
      } else results.query[key] = value;
    }
  }
};

module.exports = Interpreter;

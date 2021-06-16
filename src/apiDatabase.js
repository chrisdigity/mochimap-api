/**
 *  apiDatabase.js; MongoDB interface for the MochiMap api database
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

/* global BigInt */

// monkey-patch RegExp serialization
/* eslint no-extend-native: ["error", { "exceptions": ["RegExp"] }] */
/* Object.defineProperty(RegExp.prototype, 'toJSON', {
  value: RegExp.prototype.toString // JSON.stringify RegExp for console.debug
}); */

/* connection uri check */
if (typeof process.env.DBURI === 'undefined') {
  console.warn('// WARNING: MongoDB connection uri is undefined');
  console.warn('// Database connection error expected...');
}

const { asUint64String, fidFormat } = require('./apiUtils');
const { MongoClient, Long } = require('mongodb');

let Client; // cached client connection
let ClientConnecting = false; // for identifying client connection in progress
const ClientOptions = { useUnifiedTopology: true };
const ClientURI = process.env.DBURI;
const ClientWait = (poll = 0) => new Promise((resolve) => {
  const checkConnecting = () => {
    if (ClientConnecting) setTimeout(checkConnecting, poll);
    else resolve();
  };
  checkConnecting();
});
const Db = {
  _collection: async (cName) => {
    const fid = fidFormat('Db._collection', cName);
    if (ClientConnecting) {
      // console.debug(fid, 'client connection in progress, wait...');
      await ClientWait(50);
    }
    if (!Client) {
      // console.debug(fid, 'create new client...');
      Client = new MongoClient(ClientURI, ClientOptions);
    } // else console.debug(fid, 'using cached client...');
    if (!Client.isConnected()) {
      // console.debug(fid, 'connecting to database...');
      ClientConnecting = true;
      try {
        await Client.connect();
        // console.debug(fid, 'establish and verify connection to database...');
        await Client.db().command({ ping: 1 });
        // console.debug(fid, 'client connected succesfully');
      } catch (error) {
        Client = undefined;
        console.trace(fid, 'client connection failed;', error);
      } finally { ClientConnecting = false; }
    }
    // console.debug(fid, 'fetch collection...');
    return Client.db().collection(cName);
  },
  insert: async (cName, docs) => {
    const fid = fidFormat('Db.insert', cName, docs);
    const col = await Db._collection(cName, fid);
    // console.debug(fid, 'insert documents...');
    const cmd = Array.isArray(docs)
      ? await col.insertMany(docs)
      : await col.insertOne(docs);
    // console.debug(fid, cmd.result.n, 'documents inserted!');
    return cmd.result.n;
  },
  find: async (cName, query, options = {}) => {
    const fid = fidFormat('Db.find', cName, query, options);
    const col = await Db._collection(cName, fid);
    // console.debug(fid, 'force unnatural sort (desc)...');
    Object.assign(options, { sort: { _id: -1 } });
    // console.debug(fid, 'query applied;', JSON.stringify(query));
    // console.debug(fid, 'options applied;', JSON.stringify(options));
    const cursor = await col.find(query, options);
    // console.debug(fid, await cursor.hasNext()
    //   ? 'return cursor...' : 'no results...');
    return cursor;
  },
  findOne: async (cName, query, options = {}) => {
    const fid = fidFormat('Db._oneFind', cName, query, options);
    const col = await Db._collection(cName, fid);
    // console.debug(fid, 'force unnatural sort (desc)...');
    Object.assign(options, { sort: { _id: -1 } });
    // console.debug(fid, 'query applied;', JSON.stringify(query));
    // console.debug(fid, 'options applied;', JSON.stringify(options));
    // console.debug(fid, 'find document...');
    const doc = await col.findOne(query, options);
    // console.debug(fid, doc ? 'return document...' : 'no result...');
    return doc;
  },
  has: async (cName, ...args) => {
    const fid = fidFormat('Db.has', cName, ...args);
    const col = await Db._collection(cName, fid);
    // console.debug(fid, 'determine _id for query...');
    const query = { _id: Db.util.id[cName](...args) };
    // console.debug(fid, 'count documents...');
    const options = { limit: 1, sort: { _id: -1 } };
    const count = await col.countDocuments(query, options);
    // console.debug(fid, 'found', count, 'documents...');
    return count;
  },
  stream: async (cName, pipeline = [], options = {}) => {
    const fid = fidFormat('Db.stream', cName, pipeline, options);
    const col = await Db._collection(cName, fid);
    // console.debug(fid, 'obtain change stream...');
    return col.watch(pipeline, options);
  },
  update: async (cName, update, query, options) => {
    const fid = fidFormat('Db.update', cName, update, query);
    const col = await Db._collection(cName, fid);
    // console.debug(fid, 'update documents...');
    const cmd = Array.isArray(update)
      ? await col.updateMany(query, update, options)
      : await col.updateOne(query, update, options);
    // console.debug(fid, cmd.result.n, 'documents updated!');
    return cmd.result.n;
  },
  util: {
    dotNotationUpdateExpression: (obj, depth = 0, keychain = '', add) => {
      return Object.entries(obj).reduce((expr, [key, value]) => {
        const d1 = depth - 1;
        const keyring = keychain + key;
        if (typeof value === 'object' && !Array.isArray(value) && d1 !== 0) {
          add = Db.util.dotNotationUpdateExpression(value, d1, keyring + '.');
        } else add = { [keychain + key]: value };
        return { ...expr, ...add };
      }, {});
    },
    filterBigInt: (obj) => {
      for (const key of Object.keys(obj)) {
        if (typeof obj[key] === 'object') Db.util.filterBigInt(obj[key]);
        else if (typeof obj[key] === 'bigint') {
          obj[key] = Db.util.long(obj[key]);
        }
      }
      return obj;
    },
    filterLong: (obj) => {
      const newObj = {};
      for (const key of Object.keys(obj)) {
        if (typeof obj[key] === 'object') {
          newObj[key] = Db.util.filterLong(obj[key]);
        } else if (obj[key] instanceof Long) {
          newObj[key] = BigInt(obj[key].toString());
        } else newObj[key] = obj[key];
      }
      return newObj;
    },
    id: {
      block: (bnum, bhash, fid) => {
        if (typeof bnum === 'number' || typeof bnum === 'bigint') {
          // console.debug('Db.util.id.block: force 64-bit hex bnum');
          bnum = asUint64String(bnum);
        }
        // console.debug('Db.util.id.blockforce 16 char bhash');
        bhash = bhash.slice(0, 16).padStart(16, '0');
        return [bnum, bhash].join('-');
      },
      ledger: (bnum, bhash, addr) => {
        return [Db.util.id.block(bnum, bhash), addr].join('-');
      },
      network: (ip, category) => {
        const agg = [...ip.split('.')];
        if (typeof category !== 'undefined') agg.push(category); // optional
        return agg.join('-');
      },
      transaction: (bnum, bhash, txid) => {
        return [Db.util.id.block(bnum, bhash), txid].join('-');
      }
    },
    long: (number) => Long.fromString(number.toString())
  }
};

module.exports = Db;

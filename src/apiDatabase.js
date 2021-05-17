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
  console.warn('// WARNING: MongoDB connection uri (DBURI .env) is undefined');
  console.warn('// Database connection error expected...');
}

const { asUint64String, fidFormat } = require('./util');
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
    if (Client === null) {
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
        Client = null;
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
  update: async (cName, update, query, options) => {
    const fid = fidFormat('Db.update', cName, update, query);
    const col = await Db._collection(cName, fid);
    // console.debug(fid, 'add atomic operators...');
    update = { $set: update };
    // console.debug(fid, 'update documents...');
    const cmd = Array.isArray(update)
      ? await col.updateMany(query, update, options)
      : await col.updateOne(query, update, options);
    // console.debug(fid, cmd.result.n, 'documents updated!');
    return cmd.result.n;
  },
  util: {
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
      for (const key of Object.keys(obj)) {
        if (typeof obj[key] === 'object') Db.util.filterLong(obj[key]);
        else if (obj[key] instanceof Long) {
          obj[key] = BigInt(obj[key].toString());
        }
      }
      return obj;
    },
    id: {
      block: (bnum, bhash, fid) => {
        fid = fid || fidFormat('Db.util.id.block', bnum, bhash);
        if (typeof bnum === 'number' || typeof bnum === 'bigint') {
          // console.debug(fid, 'force 64-bit hex bnum');
          bnum = asUint64String(bnum);
        } else if (typeof bnum === 'string') {
          // console.debug(fid, 'force 16 char bnum');
          bnum = bnum.slice(0, 16).padStart(16, '0');
        } else throw new Error(`${fid} invalid bnum type`);
        if (typeof bhash === 'string') {
          // console.debug(fid, 'force 16 char bhash');
          bhash = bhash.slice(0, 16).padStart(16, '0');
        } else throw new Error(`${fid} invalid bhash type`);
        return [bnum, bhash].join('-');
      },
      ledger: (bnum, bhash, tag, fid) => {
        fid = fid || fidFormat('Db.util.id.ledger', bnum, bhash, tag);
        if (typeof tag === 'string') {
          // console.debug(fid, 'force 24 char tag');
          tag = tag.slice(0, 24).padStart(24, '0');
        } else throw new Error(`${fid} invalid tag type`);
        return [Db.util.id.block(bnum, bhash, fid), tag].join('-');
      },
      network: (ip, category, fid) => {
        fid = fid || fidFormat('Db.util.id.network', ip, category);
        const agg = [];
        if (typeof ip === 'string') agg.push(...ip.split('.'));
        else throw new Error(`${fid} invalid ip type`);
        if (typeof category !== 'undefined') { // optional
          if (typeof category === 'string') agg.push(category);
          else throw new Error(`${fid} invalid category type`);
        }
        return agg.join('-');
      },
      transaction: (bnum, bhash, txid, fid) => {
        fid = fid || fidFormat('Db.util.id.transaction', bnum, bhash, txid);
        if (typeof txid === 'string') {
          // console.debug(fid, 'force 64 char txid');
          txid = txid.slice(0, 64).padStart(64, '0');
        } else throw new Error(`${fid} invalid txid type`);
        return [Db.util.id.block(bnum, bhash, fid), txid].join('-');
      }
    },
    long: (number) => Long.fromString(number.toString())
  }
};

module.exports = Db;

/**
 *  MochiMap MongoDB Interface
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
 **
 * A MongoDB wrapper, for MochiMap, to simplify access and manage a cached
 * connection to the database and it's data. Also provides utilities for unique
 * id (_id) management and conversion to MongoDB's Long data type.
 * Notes:
 *  - the underscore (_) prefix denotes internal uage (primarily)
 *
 */

const { asUint64String, fidFormat } = require('./util');
const { MongoClient, Long } = require('mongodb');

const MongoClientOptions = { useUnifiedTopology: true };
const MongoClientURI = process.env.MONGO_URI;
const Mongo = {
  _client: null,
  _clientConnecting: false, // for identifying client connection in progress
  _clientWait: (poll = 0) => new Promise((resolve) => {
    const checkConnecting = () => {
      if (Mongo._clientConnecting) setTimeout(checkConnecting, poll);
      else resolve();
    };
    checkConnecting();
  }),
  _connect: async (cName) => {
    const fid = fidFormat('Mongo._connect', cName);
    if (Mongo._clientConnecting) {
      console.debug(fid, 'client connection in progress, wait...');
      await Mongo._clientWait(50);
    }
    if (Mongo._client === null) {
      console.debug(fid, 'create new client...');
      Mongo._client = new MongoClient(MongoClientURI, MongoClientOptions);
    } else console.debug(fid, 'using cached client...');
    if (!Mongo._client.isConnected()) {
      console.debug(fid, 'connecting to database...');
      Mongo._clientConnecting = true;
      try {
        await Mongo._client.connect();
        console.debug(fid, 'client connected succesfully');
      } catch (error) {
        Mongo._client = null;
        console.trace(fid, 'client connection failed;', error);
      } finally { Mongo._clientConnecting = false; }
    }
    console.debug(fid, 'fetch collection...');
    const client = Mongo._client;
    return { client, collection: client.db().collection(cName) };
  },
  insert: async (cName, docs) => {
    const fid = fidFormat('Mongo.insert', cName, docs);
    const conn = await Mongo._connect(cName, fid);
    console.debug(fid, 'insert documents...');
    const cmd = Array.isArray(docs)
      ? await conn.collection.insertMany(docs)
      : await conn.collection.insertOne(docs);
    console.debug(fid, cmd.result.n, 'documents inserted!');
    return cmd.result.n;
  },
  find: async (cName, query, options = {}) => {
    const fid = fidFormat('Mongo.find', cName, JSON.stringify(query),
      JSON.stringify(options));
    const conn = await Mongo._connect(cName, fid);
    console.debug(fid, 'force unnatural sort (desc)...');
    Object.assign(options, { sort: { $natural: -1 } });
    const cursor = await conn.collection.find(query, options);
    console.debug(fid, await cursor.hasNext() ? 'return cursor...' : 'no results...');
    return cursor;
  },
  findOne: async (cName, query, options = {}) => {
    const fid = fidFormat('Mongo._oneFind', cName, JSON.stringify(query),
      JSON.stringify(options));
    const conn = await Mongo._connect(cName, fid);
    console.debug(fid, 'force unnatural sort (desc)...');
    Object.assign(options, { sort: { $natural: -1 } });
    console.debug(fid, 'find document...');
    const doc = await conn.collection.findOne(query, options);
    console.debug(fid, doc ? 'return document...' : 'no result...');
    return doc;
  },
  has: async (cName, ...args) => {
    const fid = fidFormat('Mongo.has', cName, ...args);
    const conn = await Mongo._connect(cName, fid);
    console.debug(fid, 'determine _id for query...');
    const query = { _id: Mongo.util.id[cName](...args) };
    console.debug(fid, 'count documents...');
    const options = { limit: 1, sort: { $natural: -1 } };
    const count = await conn.collection.countDocuments(query, options);
    console.debug(fid, 'found', count, 'documents...');
    return count;
  },
  update: async (cName, update, query) => {
    const fid = fidFormat('Mongo.update', cName, update, query);
    const conn = await Mongo._connect(cName, fid);
    console.debug(fid, 'add atomic operators...');
    update = { $set: update };
    console.debug(fid, 'update documents...');
    const cmd = Array.isArray(update)
      ? await conn.collection.updateMany(query, update)
      : await conn.collection.updateOne(query, update);
    console.debug(fid, cmd.result.n, 'documents updated!');
  },
  util: {
    id: {
      block: (bnum, bhash, fid) => {
        fid = fid || fidFormat('Mongo.util.id.block', bnum, bhash);
        if (typeof bnum === 'number' || typeof bnum === 'bigint') {
          console.debug(fid, 'force 64-bit hex bnum');
          bnum = asUint64String(bnum);
        } else if (typeof bnum === 'string') {
          console.debug(fid, 'force 16 char bnum');
          bnum = bnum.slice(0, 16).padStart(16, '0');
        } else throw new Error(`${fid} invalid bnum type`);
        if (typeof bhash === 'string') {
          console.debug(fid, 'force 16 char bhash');
          bhash = bhash.slice(0, 16).padStart(16, '0');
        } else throw new Error(`${fid} invalid bhash type`);
        return [bnum, bhash].join('-');
      },
      transaction: (txid, bnum, bhash, fid) => {
        fid = fid || fidFormat('Mongo.util.id.transaction', txid, bnum, bhash);
        if (typeof txid === 'string') {
          console.debug(fid, 'force 64 char txid');
          txid = txid.slice(0, 64).padStart(64, '0');
        } else throw new Error(`${fid} invalid bhash type`);
        return [txid, Mongo.util.id.block(bnum, bhash, fid)].join('-');
      }
    },
    long: (number) => Long.fromString(number.toString())
  }
};

module.exports = Mongo;

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
 * A MongoDB wrapper, for MochiMap, to perform restrictive commands based on
 * https://mongodb.github.io/node-mongodb-native/3.3/reference/unified-topology/
 *
 * Implements get, has, process and update functions for searching, checking,
 * processing and updating database entries for MochiMap data types, where the
 * _id (unique ID) of the associated data is handled automatically via the use
 * of appropriate data identifiers (txid, bnum, bhash).
 *
 * Notes:
 *  - the underscore (_) prefix denotes internal uage (primarily)
 *
 */

/* global BigInt */
/* eslint no-extend-native: ["error", { "exceptions": ["BigInt"] }] */
BigInt.prototype.toBSON = function () { return this.toString(); };

const { asUint64String, fidFormat } = require('./mochimap.util');
const { MongoClient } = require('mongodb');
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
  _disconnect: async () => {
    const fid = fidFormat('Mongo._disconnect');
    if (Mongo._client && Mongo._client.isConnected()) {
      console.debug(fid, 'disconnecting client...');
      await Mongo._client.close();
    }
  },
  _id: {
    block: (bnum, bhash) => {
      const fid = fidFormat('Mongo._id.block', bnum, bhash);
      if (typeof bnum === 'number' || typeof bnum === 'bigint') {
        console.debug(fid, 'force 64-bit hex bnum');
        bnum = asUint64String(bnum);
      } else if (typeof bnum === 'string') {
        console.debug(fid, 'force 16 character bnum');
        bnum = bnum.slice(0, 16).padStart(16, '0');
      } else throw new Error(`${fid} invalid bnum type`);
      if (typeof bhash === 'string') {
        console.debug(fid, 'force 16 character bhash');
        bhash = bhash.slice(0, 16).padStart(16, '0');
      } else throw new Error(`${fid} invalid bhash type`);
      return [bnum, bhash].join('-');
    },
    transaction: (txid, bnum, bhash) => {
      const fid = fidFormat('Mongo._id.transaction', txid, bnum, bhash);
      if (typeof txid === 'string') {
        console.debug(fid, 'force 64 character txid');
        txid = txid.slice(0, 64).padStart(64, '0');
      } else throw new Error(`${fid} invalid bhash type`);
      if (typeof bnum === 'number' || typeof bnum === 'bigint') {
        console.debug(fid, 'convert bnum to 64-bit hex');
        bnum = asUint64String(bnum);
      } else if (typeof bnum === 'string') {
        console.debug(fid, 'force 16 character bnum');
        bnum = bnum.slice(0, 16).padStart(16, '0');
      } else throw new Error(`${fid} invalid bnum type`);
      if (typeof bhash === 'string') {
        console.debug(fid, 'force 16 character bhash');
        bhash = bhash.slice(0, 16).padStart(16, '0');
      } else throw new Error(`${fid} invalid bhash type`);
      return [txid, bnum, bhash].join('-');
    }
  },
  _insert: async (cName, docs) => {
    const fid = fidFormat('Mongo._insert', cName, docs);
    const conn = await Mongo._connect(cName, fid);
    console.debug(fid, 'insert document/s...');
    const cmd = Array.isArray(docs)
      ? await conn.collection.insertMany(docs)
      : await conn.collection.insertOne(docs);
    console.debug(fid, cmd.result.n, 'doc/s inserted!');
    return cmd.result.n;
  },
  _manyFind: async (cName, query, options = {}) => {
    const fid = fidFormat('Mongo._manyFind', cName, query, options);
    const conn = await Mongo._connect(cName, fid);
    console.debug(fid, 'return cursor...');
    return conn.collection.find(query, options);
  },
  _oneFind: async (cName, query, options = {}) => {
    const fid = fidFormat('Mongo._oneFind', cName, query, options);
    const conn = await Mongo._connect(cName, fid);
    console.debug(fid, 'return document...');
    return conn.collection.findOne(query, options);
  },
  _oneCount: async (cName, ...args) => {
    const fid = fidFormat('Mongo._oneCount', cName, ...args);
    const conn = await Mongo._connect(cName, fid);
    console.debug(fid, 'determine _id for query...');
    const query = { _id: Mongo._id[cName](...args) };
    console.debug(fid, 'count documents...');
    const count = await conn.collection.countDocuments(query, { limit: 1 });
    console.debug(fid, 'found', count, 'documents...');
    return count;
  },
  _update: async (cName, update, query) => {
    const fid = fidFormat('Mongo._update', cName, update, query);
    const conn = await Mongo._connect(cName, fid);
    console.debug(fid, 'add atomic operators...');
    update = { $set: update };
    console.debug(fid, 'update document/s...');
    const cmd = Array.isArray(update)
      ? await conn.collection.updateMany(query, update)
      : await conn.collection.updateOne(query, update);
    console.debug(fid, cmd.result.n, 'doc/s updated!');
  },
  get: {
    blocks: (...args) => Mongo._manyFind('block', ...args),
    blockById: (...args) =>
      Mongo._oneFind('block', { _id: Mongo._id.block(...args) }),
    blockByNumber: (bnum) =>
      Mongo._oneFind('block', { bnum: bnum.toString() }),
    transactions: (...args) => Mongo._manyFind('transaction', ...args),
    transactionById: (...args) =>
      Mongo._oneFind('transaction', { _id: Mongo._id.transaction(...args) })
  },
  has: {
    block: (...args) => Mongo._oneCount('block', ...args),
    transaction: (...args) => Mongo._oneCount('transaction', ...args)
  },
  process: {
    blockUpdate: async (block) => {
      const fid = 'Mongo.process.blockUpdate():';
      const bhash = block.bhash;
      const bnum = block.bnum;
      const txDocuments = [];
      console.debug(fid, 'minify block data...');
      const blockDocument = block.toJSON(true);
      blockDocument._id = Mongo._id.block(bnum, bhash);
      if (blockDocument.type === 'normal') {
        blockDocument.txids = [];
        console.debug(fid, 'extract tx data and embed unique _id\'s...');
        block.transactions.forEach(txe => {
          const txid = txe.txid;
          blockDocument.txids.push(txid);
          txe = txe.toJSON(true);
          txe._id = Mongo._id.transaction(txid, bnum, bhash);
          txDocuments.push(txe);
        });
      }
      console.debug(fid, 'insert block document...');
      const bInsert = await Mongo._insert('block', blockDocument);
      if (bInsert < 1) {
        throw new Error(
          `${fid} insert error, inserted ${bInsert}/1 block documents`);
      }
      if (txDocuments.length) {
        console.debug(fid, 'insert transaction documents...');
        const txInsert = await Mongo._insert('transaction', txDocuments);
        if (txInsert < 1) {
          throw new Error(`${fid} insert error, ` +
            `inserted ${txInsert}/${txDocuments.length} transaction documents`);
        }
      }
    }
  },
  update: {
    blockById: (update, ...args) =>
      Mongo._update('block', update, { _id: Mongo._id.block(...args) })
  }
};

module.exports = Mongo;

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
 *  - underscore (_) prefix denotes a function designed for internal use
 *  - most functions will resolve undefined if no error was thrown on failure
 *
 */

/* global BigInt */
/* eslint no-extend-native: ["error", { "exceptions": ["BigInt"] }] */
BigInt.prototype.toBSON = function () { return this.toString(); };

/* Debugging constants - comment after debugging */
const DEBUG = console.debug;

const { asUint64String, fidFormat } = require('./mochimap.util');
const { MongoClient } = require('mongodb');
const MongoClientURI = process.env.MONGO_URI;
const MongoClientOptions = { useUnifiedTopology: true };
const Mongo = {
  _connect: (cName, fid) => {
    fid = fid || fidFormat('Mongo._connect', cName);
    DEBUG(fid, 'create client...');
    const client = new MongoClient(MongoClientURI, MongoClientOptions);
    DEBUG(fid, 'fetch collection...');
    return { client, collection: client.db().collection(cName) };
  },
  _disconnect: async (conn, fid) => {
    fid = fid || fidFormat('Mongo._disconnect');
    if (conn && conn.client) {
      DEBUG(fid, 'disconnect client...');
      await conn.client.close();
    }
  },
  _id: {
    block: (bnum, bhash) => {
      const fid = fidFormat('Mongo._id.block', bnum, bhash);
      if (typeof bnum === 'number' || typeof bnum === 'bigint') {
        DEBUG(fid, 'force 64-bit hex bnum');
        bnum = asUint64String(bnum);
      } else if (typeof bnum === 'string') {
        DEBUG(fid, 'force 16 character bnum');
        bnum = bnum.slice(0, 16).padStart(16, '0');
      } else throw new Error(`${fid} invalid bnum type`);
      if (typeof bhash === 'string') {
        DEBUG(fid, 'force 16 character bhash');
        bhash = bhash.slice(0, 16).padStart(16, '0');
      } else throw new Error(`${fid} invalid bhash type`);
      return { _id: [bnum, bhash].join('-') };
    },
    transaction: (txid, bnum, bhash) => {
      const fid = fidFormat('Mongo._id.transaction', txid, bnum, bhash);
      if (typeof txid === 'string') {
        DEBUG(fid, 'force 64 character txid');
        txid = txid.slice(0, 64).padStart(64, '0');
      } else throw new Error(`${fid} invalid bhash type`);
      if (typeof bnum === 'number' || typeof bnum === 'bigint') {
        DEBUG(fid, 'convert bnum to 64-bit hexadecimal string');
        bnum = asUint64String(bnum);
      } else if (typeof bnum === 'string') {
        DEBUG(fid, 'force 16 character bnum');
        bnum = bnum.slice(0, 16).padStart(16, '0');
      } else throw new Error(`${fid} invalid bnum type`);
      if (typeof bhash === 'string') {
        DEBUG(fid, 'force 16 character bhash');
        bhash = bhash.slice(0, 16).padStart(16, '0');
      } else throw new Error(`${fid} invalid bhash type`);
      return { _id: [txid, bnum, bhash].join('-') };
    }
  },
  _insert: async (cName, docs) => {
    const fid = fidFormat('Mongo._insert', cName, docs);
    let conn;
    try {
      conn = Mongo._connect(cName, fid);
      DEBUG(fid, 'insert document/s...');
      const cmd = Array.isArray(docs)
        ? await conn.collection.insertMany(docs)
        : await conn.collection.insertOne(docs);
      DEBUG(fid, cmd.result.n, 'doc/s inserted!');
      return cmd.result.n;
    } finally { await Mongo._disconnect(conn, fid); }
  },
  _many: async (cName, query, options = {}) => {
    const fid = fidFormat('Mongo._many', cName, query, options);
    let conn;
    try {
      conn = Mongo._connect(cName, fid);
      DEBUG(fid, 'return cursor...');
      return conn.collection.find(query, options);
    } finally { await Mongo._disconnect(conn, fid); }
  },
  _one: async (cName, query, options = {}) => {
    const fid = fidFormat('Mongo._one', cName, query, options);
    let conn;
    try {
      conn = Mongo._connect(cName, fid);
      DEBUG(fid, 'return document...');
      return conn.collection.findOne(query, options);
    } finally { await Mongo._disconnect(conn, fid); }
  },
  _oneCount: async (cName, ...args) => {
    const fid = fidFormat('Mongo._oneCount', cName, ...args);
    let conn;
    try {
      conn = Mongo._connect(cName, fid);
      DEBUG(fid, 'determine _id for query...');
      const query = Mongo._id[cName](...args);
      DEBUG(fid, 'count documents...');
      const count = await conn.collection.countDocuments(query, { limit: 1 });
      DEBUG(fid, 'found', count, 'documents...');
      return count;
    } finally { await Mongo._disconnect(conn, fid); }
  },
  _update: async (cName, update, query) => {
    const fid = fidFormat('Mongo._update', cName, update, query);
    let conn;
    try {
      conn = Mongo._connect(cName, fid);
      DEBUG(fid, 'update document/s...');
      const cmd = Array.isArray(update)
        ? await conn.collection.updateMany(query, update)
        : await conn.collection.updateOne(query, update);
      DEBUG(fid, cmd.result.n, 'doc/s updated!');
    } finally { await Mongo._disconnect(conn, fid); }
  },
  get: {
    blocks: (...args) => Mongo._many('block', ...args),
    blockById: (...args) => Mongo._one('block', Mongo._id.block(...args)),
    transactions: (...args) => Mongo._many('transaction', ...args),
    transactionById: (...args) => {
      return Mongo._one('transaction', Mongo._id.transaction(...args));
    }
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
      DEBUG(fid, 'minify block data...');
      const blockDocument = block.toJSON(true);
      blockDocument._id = Mongo._id.block(bnum, bhash);
      if (blockDocument.type === 'normal') {
        blockDocument.txids = [];
        DEBUG(fid, 'extract transaction data and embed unique _id\'s...');
        block.transactions.forEach(txe => {
          const txid = txe.txid;
          blockDocument.txids.push(txid);
          txe = txe.toJSON(true);
          txe._id = Mongo._id.transaction(txid, bnum, bhash);
          txDocuments.push(txe);
        });
      }
      DEBUG(fid, 'insert block document...');
      const bInsert = await Mongo._insert('block', blockDocument);
      if (bInsert < 1) {
        throw new Error(
          `${fid} insert error, inserted ${bInsert}/1 block documents`);
      }
      if (txDocuments.length) {
        DEBUG(fid, 'insert transaction documents...');
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
      Mongo._update('block', update, Mongo._id.block(...args))
  }
};

module.exports = Mongo;

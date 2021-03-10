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
 * Manages a single client connection through the Node.js MongoDB driver.
 * Implements get, has, process and update functions for searching, checking,
 * processing and updating database entries for MochiMap data types, where the
 * _id (unique ID) of the associated data is handled automatically via the use
 * of appropriate data identifiers (txid, bnum, bhash).
 * Notes:
 *  - underscore (_) prefix denotes a function designed for internal use
 *  - most functions will resolve null on client connection or collection
 *    failure and report to stderr as necessary
 *
 */

/* global BigInt */
const DEBUG = process.env.PRODUCTION ? () => {} : console.debug;
const ERROR = process.env.PRODUCTION ? console.error : console.trace;

const { MongoClient } = require('mongodb');

const asUint64String = (bigint) => {
  return BigInt.asUintN(64, BigInt(bigint)).toString(16).padStart(16, '0');
};

const Mongo = {
  _client: null, // for caching client
  _connecting: false, // for identifying client connection in progress
  _connectingWait: (poll) => new Promise((resolve) => {
    const checkConnecting = () => {
      if (Mongo._connecting) return setTimeout(checkConnecting, poll);
      resolve();
    };
    checkConnecting();
  }),
  _id: {
    block: (bnum, bhash) => {
      const fid = `Mongo._id.block(${bnum}, ${bhash}):`;
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
      return [bnum, bhash].join('-');
    },
    transaction: (txid, bnum, bhash) => {
      const fid = `Mongo._id.transaction(${txid}, ${bnum}, ${bhash}):`;
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
      return [bnum, bhash].join('-');
    }
  },
  _insert: async (coName, docs) => {
    const fid = `Mongo._insert(${coName}, ${docs.length} document/s)`;
    DEBUG(fid, 'get collection...');
    const collection = await Mongo.get._collection(coName);
    if (collection) {
      DEBUG(fid, 'collection found, inserting...');
      const cmd = Array.isArray(docs) ? await collection.insertMany(docs)
        : await collection.insertOne(docs);
      DEBUG(fid, cmd.result.n, 'document/s inserted successfully!');
      return cmd.result.n;
    }
    return null;
  },
  _update: async (coName, query, docs) => {
    const fid = `Mongo._update(${coName}, ${query}, ${docs.length} document/s)`;
    DEBUG(fid, 'get collection...');
    const collection = await Mongo.get._collection(coName);
    if (collection) {
      DEBUG(fid, 'collection found, updating...');
      const cmd = Array.isArray(docs) ? await collection.updateMany(query, docs)
        : await collection.updateOne(query, docs);
      DEBUG(fid, cmd.result.n, 'document/s updated successfully!');
      return cmd.result.n;
    }
    return null;
  },
  close: async () => {
    const fid = 'Mongo.close():';
    const client = await Mongo.get._client(false);
    if (client) {
      if (client.isConnected) {
        DEBUG(fid, 'client connected, closing...');
        try {
          await client.close();
          DEBUG(fid, 'client connection closed successfully.');
        } catch (error) {
          ERROR(fid, 'failed to close client connection;', error);
        }
      } else DEBUG(fid, 'client not connected, ignoring...');
    } else DEBUG(fid, 'no client detected, ignoring...');
  },
  get: {
    _client: async (connect = true) => {
      const mURL = 'mongodb://localhost.com:27017/mochimap';
      const fid = 'Mongo.get._client():';
      if (Mongo._connecting) {
        DEBUG(fid, 'client connection in progress, wait...');
        await Mongo._connectingWait(50);
      }
      if (Mongo._client && !Mongo._client.isConnected && connect) {
        DEBUG(fid, 'client not connected, connecting...');
        Mongo._connecting = true;
        try {
          await Mongo._client.connect(mURL);
          DEBUG(fid, 'client connected succesfully.');
        } catch (error) {
          Mongo._client = null;
          ERROR(fid, 'client connection failed, removed;', error);
        } finally { Mongo._connecting = false; }
      }
      if (Mongo._client === null && connect) {
        DEBUG(fid, 'client not found, create new client connection...');
        Mongo._connecting = true;
        try {
          Mongo._client = await MongoClient.connect(mURL);
          DEBUG(fid, 'new client connection created successfully.');
        } catch (error) {
          ERROR(fid, 'new client connection failed;', error);
        } finally { Mongo._connecting = false; }
      }
      return Mongo._client;
    },
    _collection: async (coName) => {
      const fid = `Mongo.get._collection('${coName}'):`;
      DEBUG(fid, 'get client...');
      const client = await Mongo.get._client();
      if (client) {
        DEBUG(fid, 'return collection...');
        try {
          return client.db().collection(coName);
        } catch (error) {
          ERROR(fid, 'failed to return collection;', error);
        }
      }
      return null;
    },
    _cursor: async (coName, query, options = {}) => {
      const fid = `Mongo.get._cursor(${query}, ${options}):`;
      DEBUG(fid, 'force descending sort on _id');
      Object.assign(options, { sort: { _id: -1 } });
      DEBUG(fid, 'get collection...');
      const collection = await Mongo.get._collection(coName);
      if (collection) {
        try {
          DEBUG(fid, 'return cursor...');
          return collection.find(query, options);
        } catch (error) {
          ERROR(fid, 'failed to return cursor;', error);
        }
      }
      return null;
    },
    _one: async (coName, query, options = {}) => {
      const fid = `Mongo.get._one(${query}, ${options}):`;
      DEBUG(fid, 'get collection...');
      const collection = await Mongo.get._collection(coName);
      if (collection) {
        try {
          DEBUG(fid, 'return cursor...');
          return collection.findOne(query, options);
        } catch (error) {
          ERROR(fid, 'failed to return cursor;', error);
        }
      }
      return null;
    },
    blocks: (query, options) =>
      Mongo.get._cursor('block', query, options),
    blockById: (bnum, bhash) =>
      Mongo.get._one('block', { _id: Mongo._id.block(bnum, bhash) }),
    transactions: (query, options) =>
      Mongo.get._cursor('transaction', query, options),
    transactionById: (txid, bnum, bhash) => {
      const query = { _id: Mongo._id.transaction(txid, bnum, bhash) };
      return Mongo.get._one('block', query);
    }
  },
  has: {
    _document: async (coName, ...args) => {
      const fid = `Mongo.has._document(${coName}, ${args.toString()}):`;
      DEBUG(fid, 'get collection...');
      const collection = await Mongo.get._collection(coName);
      if (collection) {
        DEBUG(fid, 'determine _id for query...');
        const query = { _id: Mongo._id[coName](...args) };
        DEBUG(fid, 'count documents...');
        return await collection.countDocuments(query, { limit: 1 });
      }
      return null;
    },
    block: (bnum, bhash) =>
      Mongo.has._document('block', bnum, bhash),
    transaction: (txid, bnum, bhash) =>
      Mongo.has._document('transaction', txid, bnum, bhash)
  },
  process: {
    blockUpdate: async (block) => {
      const fid = 'Mongo.process.blockUpdate():';
      const bhash = block.bhash;
      const bnum = block.bnum;
      DEBUG(fid, 'minify block data...');
      const blockDocument = block.toJSON(true);
      blockDocument._id = Mongo._id.block(bnum, bhash);
      blockDocument.txids = [];
      DEBUG(fid, 'extract transaction data and embed unique _id\'s...');
      const txDocuments = [];
      block.transactions.forEach(txe => {
        const txid = txe.txid;
        blockDocument.txids.push(txid);
        txe = txe.toJSON(true);
        txe._id = Mongo._id.transaction(txid, bnum, bhash);
        txDocuments.push(txe);
      });
      DEBUG(fid, 'insert block document...');
      const bInsert = await Mongo._insert('block', blockDocument);
      if (bInsert < 1) {
        throw new Error(
          `${fid} insert error, inserted ${bInsert}/1 block documents`);
      }
      DEBUG(fid, 'insert transaction documents...');
      const txInsert = await Mongo._insert('transaction', txDocuments);
      if (txInsert < 1) {
        throw new Error(`${fid} insert error, ` +
          `inserted ${txInsert}/${txDocuments.length} transaction documents`);
      }
    }
  },
  update: {
    block: (query, docs) => Mongo._update('block', query, docs),
    blockById: (bnum, bhash, docs) => {
      const query = { _id: Mongo._id.block(bnum, bhash) };
      return Mongo._update('block', query, docs);
    }
  }
};

module.exports = Mongo;

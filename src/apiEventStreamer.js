/**
 *  apiEventStreamer.js; Mochimo Network event streamer for MochiMap
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

/* modules and utilities */
const fs = require('fs');
const path = require('path');
const { ms } = require('./apiUtils');
const Db = require('./apiDatabase');
const Mochimo = require('mochimo');

const HDIR = require('os').homedir();
const TXCLEAN = process.env.TXCLEAN || 'txclean.dat';
const MAXCACHE = 5;
let TXCLEANPOS = 0;

// initialize Event types and base properties
const Events = ['block', 'network', 'transaction'];
const EventGen = () => ({ cache: [], connections: new Set(), initd: false });
const Event = Events.reduce((obj, cur) => ({ ...obj, [cur]: EventGen() }), {});

// initialize ServerSideEvent broadcast function
const Broadcast = (json, event) => {
  const eObj = Event[event];
  const id = new Date().toISOString();
  // for empty broadcasts, simply send the id in a comment as a heartbeat
  if (!json) return eObj.connections.forEach((res) => res.write(`: ${id}\n\n`));
  // convert json to data
  const data = JSON.stringify(json);
  // manage FILO cache length at MAXCACHE length
  while (eObj.cache.length >= MAXCACHE) eObj.cache.pop();
  eObj.cache.unshift({ id, data });
  // broadcast data to all relevant connections
  eObj.connections.forEach((connection) => {
    connection.write('id: ' + id + '\n');
    connection.write('data: ' + data + '\n');
    connection.write('event: ' + event + '\n\n');
  });
};

// initialize Event handlers
Event.block.handler = (event) => {
  const { fullDocument, operationType } = event;
  // only stream new block updates
  if (operationType === 'insert') Broadcast(fullDocument, 'block');
};
Event.network.handler = (event) => {
  // expose _id from event.documentKey
  const { _id } = event.documentKey;
  // obtain updated fields' keys for updates that aren't connect- type updates
  const fields = event.updateDescription.updatedFields;
  const updated = Object.keys(fields).filter(key => !key.includes('connect'));
  // broadcast updates for updated fields existing in addition to connect- type
  if (updated.length) Broadcast(Object.assign({ _id }, fields), 'network');
};
Event.transaction.filepath = path.join(HDIR, 'mochimo', 'bin', 'd', TXCLEAN);
Event.transaction.handler = async (stats) => {
  if (!stats) return; // ignore events with missing "current" stats object
  let filehandle;
  try {
    const type = 'transaction';
    const eObj = Event[type];
    const { length } = Mochimo.TXEntry;
    const { size } = stats;
    // if txclean reduces filesize, reset TXCLEAN position
    if (size < TXCLEANPOS) TXCLEANPOS = 0;
    let position = TXCLEANPOS;
    // ensure TXCLEAN has data
    let remainingBytes = size - position;
    if (remainingBytes) {
      // ensure remainingBytes is valid size
      const invalidBytes = remainingBytes % length;
      if (invalidBytes) {
        const details = { size, position, invalidBytes };
        return console.error(`TXCLEAN invalid, ${JSON.stringify(details)}`);
      } // otherwise, open txclean file for reading
      filehandle = await fs.promises.open(eObj.filepath);
      for (; remainingBytes; position += length, remainingBytes -= length) {
        const buffer = Buffer.alloc(length);
        const result = await filehandle.read({ buffer, position });
        // if sufficient bytes were read, Broadcast txentry
        if (result.bytesRead === length) {
          Broadcast(new Mochimo.TXEntry(result.buffer).toJSON(true), type);
        } else { // otherwise, report details as an error
          const details = { position, bytesRead: result.bytesRead };
          console.error('insufficient txentry bytes,', JSON.stringify(details));
        }
      }
    }
  } catch (error) {
    console.trace(error);
  } finally {
    // ensure filehandle is closed after use
    if (filehandle) await filehandle.close();
  }
};

/* EventStreamer */
const EventStreamer = {
  _stale: ms.second * 30,
  _timer: undefined,
  connect: async (res, events) => {
    const keys = new URLSearchParams(events).keys();
    const connections = Array.from(keys, ([event]) => Event[event].connections);
    // add response reference to appropriate event connection sets
    connections.forEach((conn) => conn.add(res));
    // add close event handler to response for removal from connections Set
    res.on('close', () => connections.forEach((conn) => conn.delete(res)));
    // write header to response
    res.writeHead(200, {
      'X-XSS-Protection': '1; mode=block',
      'X-Robots-Tag': 'none',
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Type': 'text/event-stream',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      Connection: 'keep-alive',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*'
    });
    res.write('\n\n');
  }, // end connect...
  heartbeat: () => {
    const pingBefore = new Date() - EventStreamer._stale;
    // synchronously ping all event streams lacking activity
    for (const [type, event] of Object.entries(Event)) {
      if (event.cache.length < 1 || new Date(event.cache[0].id) < pingBefore) {
        Broadcast(undefined, type); // ping
      }
    }
  }, // end heartbeat...
  init: async () => {
    console.log('// INIT: EventStreamer...');
    try {
      // synchronously initialize all event streams
      for (const [name, event] of Object.entries(Event)) {
        if (!event.initd) {
          // initialize filewatcher, or change stream for database collection
          if (event.filepath) fs.watchFile(event.filepath, event.handler);
          else (await Db.stream(name)).on('change', event.handler);
          // flag event type as initialized
          event.initd = true;
        }
      }
      // set heartbeat timer
      EventStreamer._timer =
        setInterval(EventStreamer.heartbeat, EventStreamer._stale);
      // report initialization
      console.log('// INIT: EventStreamer done!');
    } catch (error) {
      console.error('// INIT:', error);
      console.error('// INIT: failed to initialize Watcher');
      console.error('// INIT: ( block / network / transaction ) status');
      console.error('// INIT: (', Event.block.initialized, '/',
        Event.transaction.initialized, '/', Event.network.initialized, ')');
      console.error('// INIT: resuming initialization in 60 seconds...');
      EventStreamer._timer = setTimeout(EventStreamer.init, ms.minute);
    }
  } // end init...
}; // end const EventStreamer...

// initialize EventStreamer
EventStreamer.init();

module.exports = EventStreamer;

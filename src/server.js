/**
 *  server.js; Server for MochiMap
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
const https = require('https');
const http = require('http');
const fs = require('fs');

/* Server */
module.exports =
class Server {
  constructor ({ name, secure, sslkey, sslcert }) {
    name = name || 'Server';
    // apply instance parameters
    Object.assign(this, {
      _sockets: new Set(),
      connections: new Set(),
      eventConnections: {},
      name,
      routes: []
    });
    // initialize server
    if (!this.secure) this.api = http.createServer();
    else { // include ssl cert and key
      this.api = https.createServer({
        key: sslkey ? fs.readFileSync(sslkey) : null,
        cert: sslcert ? fs.readFileSync(sslcert) : null
      });
    }
    // set http server events
    this.api.on('request', this.router.bind(this));
    this.api.on('error', console.error.bind(this, this.name, '//'));
    this.api.on('connect', (res, socket/* , head */) => {
      this._sockets.add(socket); // track socket connections
      socket.on('end', () => this._sockets.delete(socket));
    });
    this.api.on('listening', () => {
      const { address, port } = this.api.address();
      console.log(this.name, `// Listening on ${address}:${port}`);
    });
    // start http server
    this.api.listen(this.secure ? 443 : 80, '0.0.0.0');
  }

  cleanup () {
    const server = this;
    return new Promise((resolve) => {
      // close server (removing connections) and/or resolve promise
      if (server.api) {
        console.log('CLEANUP', 'initiating server shutdown...');
        server.api.close(() => resolve());
        console.log('CLEANUP', 'disconnecting all sockets...');
        server._sockets.forEach((socket) => socket.destroy());
      } else resolve();
    });
  }

  enableRoute (route) {
    this.routes.push({
      method: 'GET',
      ...route
    });
  }

  enableStream (route, events) {
    // add stream event types from as Set's in eventConnections
    if (Array.isArray(events)) {
      events.forEach((event) => {
        this.eventConnections[event] = new Set();
      });
    }
    // add stream route
    this.routes.push({
      method: 'GET',
      handler: this.streamConnect.bind(this),
      headers: { accept: ['text/event-stream'] },
      ...route
    });
  }

  streamClose (res, events) {
    this.connections.delete(res);
    for (const event of events) {
      if (event in this.eventConnections) {
        this.eventConnections[event].delete(res);
      }
    }
  }

  streamConnect (res, events) {
    events = Array.from(new URLSearchParams(events).keys());
    // add connection cleanup for close event
    res.on('close', this.streamClose.bind(this, res, events));
    // add response to appropriate eventConnections
    this.connections.add(res);
    for (const event of events) {
      if (event in this.eventConnections) {
        this.eventConnections[event].add(res);
      }
    }
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
  }

  streamEmit (json, eventType) {
    let connections;
    if (eventType && eventType in this.eventConnections) {
      connections = this.eventConnections[eventType];
    } else connections = this.connections;
    // build stream messge
    const id = new Date().toISOString();
    // for empty broadcasts (heartbeats), simply send the id in a comment
    if (!json) return connections.forEach((res) => res.write(`: ${id}\n\n`));
    // add event to json and convert json to data
    const data = JSON.stringify({ eventType, ...json });
    // broadcast data to all relevant connections
    connections.forEach((connection) => {
      connection.write('id: ' + id + '\n');
      connection.write('data: ' + data + '\n\n');
    });
  }

  respond (res, content, statusCode = 404, statusMessage = '') {
    if (!statusMessage) {
      switch (statusCode) {
        case 200: statusMessage = 'OK'; break;
        case 400: statusMessage = 'Bad Request'; break;
        case 404: statusMessage = 'Not Found'; break;
        case 406: statusMessage = 'Not Acceptable'; break;
        case 409: statusMessage = 'Conflict'; break;
        case 422: statusMessage = 'Unprocessable Entity'; break;
        case 500: statusMessage = 'Internal Server Error'; break;
        default: statusMessage = '';
      }
    }
    // assign error and message properties if required
    if (statusCode > 399 && (typeof content === 'object' && !content.error)) {
      content = Object.assign({ error: statusMessage }, content);
    }
    // process response headers
    let body, type;
    if (typeof content === 'object') {
      body = JSON.stringify(content, null, 2);
      type = 'application/json';
    } else {
      body = String(content);
      type = 'text/plain; charset=utf-8';
    }
    const headers = {
      'X-Robots-Tag': 'none',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'no-referrer',
      'Content-Type': type,
      'Content-Length': Buffer.byteLength(body),
      'Content-Security-Policy':
        "base-uri 'self'; default-src 'none'; form-action 'self'; " +
        "frame-ancestors 'none'; require-trusted-types-for 'script';",
      'Access-Control-Allow-Origin': '*'
    };
    // send response
    res.writeHead(statusCode, statusMessage, headers);
    res.end(body);
  }

  async router (req, res) {
    try {
      const requestURL = new URL(req.url, 'https://api.mochimap.com');
      const intent = { hint: '', detected: 0 };
      const params = [];
      let routeMatch;
      // find matching route from Routes
      for (const route of this.routes) {
        if (route.method !== req.method) continue;
        if (route.path instanceof RegExp) {
          const pathMatch = requestURL.pathname.match(route.path);
          if (pathMatch) {
            // route matched, break loop
            routeMatch = route;
            params.push(...pathMatch.slice(1));
            break;
          }
        } else if (route.path === requestURL.pathname) {
          // route matched, break loop
          routeMatch = route;
          break;
        }
        if (route.hint && route.hintCheck) {
          // no routes matched (yet), rank possible intentions
          const intentCheck = requestURL.pathname.match(route.hintCheck);
          if (intentCheck && intentCheck.length > intent.detected) {
            intent.detected = intentCheck.length;
            intent.hint = route.hint;
          }
        }
      }
      // ensure route was matched, otherwise respond with 400 and suggest intent
      if (!routeMatch) {
        return this.respond(res, {
          message: 'The request was not understood' +
            (intent.detected ? `, did you mean ${intent.hint}?` : '. ') +
            'Check https://github.com/chrisdigity/mochimap-api#api-endpoints'
        }, 400);
      }
      // ensure route is enabled, otherwise respond with 409
      if (!routeMatch.handler) {
        return this.respond(res, {
          message: 'this request is unavailable...'
        }, 409);
      }
      // ensure acceptable headers were included, otherwise respond with 406
      if (req.headers.accept && routeMatch.headers && routeMatch.headers.accept) {
        const acceptable = routeMatch.headers.accept;
        const accept = req.headers.accept;
        let i;
        // scan acceptable MIME types for requested acceptable MIME types
        for (i = 0; i < acceptable.length; i++) {
          if (accept.includes(acceptable[i])) break;
        }
        // check acceptable MIME type was found
        if (i === acceptable.length) {
          return this.respond(res, {
            message: 'Server was not able to match any MIME types specified in ' +
              'the Accept request HTTP header. To use this resource, please ' +
              'specify one of the following: ' + acceptable.join(', ')
          }, 406);
        }
      }
      // if a search query is included, ensure query is valid
      const search = decodeURI(requestURL.search);
      if (search && routeMatch.param instanceof RegExp) {
        if (!routeMatch.param.test(search)) {
          return this.respond(res, {
            message: 'Invalid search parameters. Check ' +
              'https://github.com/chrisdigity/mochimap-api#api-search-parameters',
            parameters: search
          }, 400);
        }
        // add search query as parameter
        params.push(search);
      } else if (routeMatch.paramsRequired) {
        return this.respond(res, {
          message: 'Missing required parameters.'
        }, 422);
      }
      // return resulting parameters to handler
      return await routeMatch.handler(res, ...params);
    } catch (error) { this.respond(res, Server.InternalError(error), 500); }
  }

  static InternalError (error) {
    // trace error
    console.trace(error);
    // return internal error response object
    return { message: `${error}`, timestamp: (new Date()).toISOString() };
  }
};

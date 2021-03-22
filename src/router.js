/**
 *  MochiMap Router - Routes API requests appropriately
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

const Responder = require('./responder');
const BaseURL = 'https://api.mochimap.com/';
const Routes = [
  {
    method: 'GET',
    path: /^\/balance\/(tag|wots)\/([0-9a-f]+)$/i,
    hint: '[BaseURL]/balance/<tag||wots>/<address>',
    hintCheck: /balance/gi,
    handler: Responder.balance,
    enabled: true
  }, {
    method: 'GET',
    path: /^\/block\/([0-9]+)|(0x[0-9a-f]+)$/i,
    hint: '[BaseURL]/block/<blockNumber>',
    hintCheck: /block/gi,
    handler: Responder.block,
    enabled: true
  }, {
    method: 'GET',
    path: '/block/search',
    hint: '[BaseURL]/block/search?<param>=<paramValue>',
    hintCheck: /block|search/gi,
    handler: Responder.searchBlock,
    enabled: false
  }, {
    method: 'GET',
    path: /^\/transaction\/([0-9a-f]+)$/i,
    hint: '[BaseURL]/transaction/<txid>',
    hintCheck: /transaction/gi,
    handler: Responder.transaction,
    enabled: true
  }, {
    method: 'GET',
    path: '/transaction/search',
    hint: '[BaseURL]/transaction/search?<param>=<paramValue>',
    hintCheck: /transaction|search/gi,
    handler: Responder.searchTransaction,
    enabled: false
  }
];

const Router = async (req, res) => {
  try {
    const { pathname, search } = new URL(req.url, BaseURL);
    const intent = { hint: '', detected: 0 };
    let routeMatch, params;
    // find matching route from Routes
    for (const route of Routes) {
      if (route.method !== req.method) continue;
      if (route.path instanceof RegExp) {
        const pathMatch = pathname.match(route.path);
        if (pathMatch) {
          // route matched, break loop
          routeMatch = route;
          params = pathMatch.slice(1);
          break;
        }
      } else if (route.path === pathname) {
        // route matched, break loop
        routeMatch = route;
        break;
      }
      // rank possible intentions
      const intentCheck = pathname.match(route.hintCheck);
      if (intentCheck && intentCheck.length > intent.detected) {
        intent.detected = intentCheck.length;
        intent.hint = route.hint;
      }
    }
    // check for matching route
    if (routeMatch) {
      // check route is enabled
      if (routeMatch.enabled) {
        // acquire additional parameters, if available
        if (search) params.push(search);
        return await routeMatch.handler(res, ...params);
      } // route is not enabled, respond with 409
      return Responder.unknown(res, 409,
        { message: 'this request is currently disabled, try again later...' });
    }
    // unkown request: suggest detected intent or check path
    let message = 'the request was not understood, ';
    if (intent.detected) message += `did you mean ${intent.hint}?`;
    else message += 'check path and try again...';
    Responder.unknown(res, 400, { message });
  } catch (error) {
    // log error and send alert response
    console.trace(error);
    const date = new Date();
    Responder.unknown(res, 500, {
      message: 'please consider opening a issue detailing this error @ ' +
        'https://github.com/chrisdigity/mochimap.com/issues',
      timestamp: date.toISOString()
    });
  }
};

module.exports = Router;

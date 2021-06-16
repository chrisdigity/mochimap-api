/**
 *  apiRouter.js; API request router for MochiMap appropriately
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

const Responder = require('./apiResponder');
const BaseURL = 'https://api.mochimap.com/';
const Routes = [
  {
    method: 'GET',
    path: /^\/block(?:\/([0-9]+)|\/(0x[0-9a-f]+))?$/i,
    hint: '[BaseURL]/block/<optional BlockNumber>',
    hintCheck: /block|0x/gi,
    handler: Responder.block,
    enabled: true
  }, {
    method: 'GET',
    path: '/block/search',
    param: /^[?]?(?:[0-9a-z_]+(?:(:|%3A)[a-z]+)?[=]+[0-9a-z-]+(?:$|&))+$/i,
    hint: '[BaseURL]/block/search?<param>=<paramValue>',
    hintCheck: /block|search/gi,
    handler: Responder.searchBlock,
    enabled: true
  }, {
    method: 'GET',
    path: /^\/chain(?:\/([0-9]+)|\/(0x[0-9a-f]+))?$/i,
    hint: '[BaseURL]/chain/<optional BlockNumber>',
    hintCheck: /chain|0x/gi,
    handler: Responder.chain,
    enabled: true
  }, {
    method: 'GET',
    path: /^\/ledger\/(tag|address)\/([0-9a-f]+)$/i,
    hint: '[BaseURL]/ledger/<"tag" or "address">/<partial Tag or Address>',
    hintCheck: /ledger|tag|address/gi,
    handler: Responder.ledger,
    enabled: true
  }, {
    method: 'GET',
    path: '/ledger/search',
    param: /^[?]?(?:[0-9a-z_.]+(?:(:|%3A)[a-z]+)?[=]+[0-9a-z.-]+(?:$|&))+$/i,
    hint: '[BaseURL]/network/search?<param>=<paramValue>',
    hintCheck: /ledger|search/gi,
    handler: Responder.searchLedger,
    enabled: true
  }, {
    method: 'GET',
    path: /^\/network(?:\/(active))?\/(?=\d+\.\d+\.\d+\.\d+)((?:(?:25[0-5]|2[0-4]\d|1\d{2}|[1-9]\d|\d)\.?){4})$/i,
    hint: '[BaseURL]/network/<optional "active">/<IPv4>',
    hintCheck: /network|node|active/gi,
    handler: Responder.network,
    enabled: true
  }, {
    method: 'GET',
    path: '/network/search',
    param: /^[?]?(?:[0-9a-z_.]+(?:(:|%3A)[a-z]+)?[=]+[0-9a-z.-]+(?:$|&))+$/i,
    hint: '[BaseURL]/network/search?<param>=<paramValue>',
    hintCheck: /network|node|search/gi,
    handler: Responder.searchNetwork,
    enabled: true
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
    param: /^[?]?(?:[0-9a-z_]+(?:(:|%3A)[a-z]+)?[=]+[0-9a-z-]+(?:$|&))+$/i,
    hint: '[BaseURL]/transaction/search?<param>=<paramValue>',
    hintCheck: /transaction|search/gi,
    handler: Responder.searchTransaction,
    enabled: true
  }
];

const Router = async (req, res) => {
  try {
    const { pathname, search } = new URL(req.url, BaseURL);
    const intent = { hint: '', detected: 0 };
    const params = [];
    let routeMatch;
    // find matching route from Routes
    for (const route of Routes) {
      if (route.method !== req.method) continue;
      if (route.path instanceof RegExp) {
        const pathMatch = pathname.match(route.path);
        if (pathMatch) {
          // route matched, break loop
          routeMatch = route;
          params.push(...pathMatch.slice(1));
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
      // ensure route is enabled
      if (routeMatch.enabled) {
        if (search && routeMatch.param instanceof RegExp) {
          // ensure search query is valid
          if (!routeMatch.param.test(search)) {
            return Responder.unknown(res, 400, {
              message: 'invalid search parameters, check request...',
              parameters: search
            });
          } // add search query as parameter
          params.push(search);
        }
        return await routeMatch.handler(res, ...params);
      } // route is not enabled, respond with 409
      return Responder.unknown(res, 409,
        { message: 'this request is currently disabled, try again later...' });
    }
    // unkown request: suggest detected intent or check path
    let message = 'the request was not understood, ';
    if (intent.detected) message += `did you mean ${intent.hint}?`;
    else message += 'check request...';
    Responder.unknown(res, 400, { message });
  } catch (error) { Responder.unknownInternal(res, error); }
};

module.exports = Router;

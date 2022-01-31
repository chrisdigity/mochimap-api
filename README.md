<h1 align="center">
  <img
    alt="MochiMap banner"
    src="docs/mochimap-banner.png"
  /><br />
  <a
    href="https://observatory.mozilla.org/analyze/api.mochimap.com"
  /><img
    alt="Mozilla HTTP Observatory Grade"
    src="https://img.shields.io/mozilla-observatory/grade/api.mochimap.com?logo=mozilla&label=Observatory&style=plastic&publish"
  /></a>
  <a
    href="https://securityheaders.com/?followRedirects=on&hide=on&q=api.mochimap.com"
  /><img
    alt="Security Headers"
    src="https://img.shields.io/security-headers?logo=keycdn&label=Security%20Headers&style=plastic&url=https%3A%2F%2Fapi.mochimap.com"
  /></a>
  <a
    href="https://stats.uptimerobot.com/KEPZ9hqnYo"
  /><img
    alt="Uptime Robot ratio (30 days) api.mochimap.com"
    src="https://img.shields.io/uptimerobot/ratio/m788515277-0bc9c8a5490e87b6e825807c?label=Uptime&logo=AIOHTTP&style=plastic"
  /></a><br />
  <a href="https://github.com/chrisdigity/mochimap.com/graphs/contributors"><img
    alt="GitHub contributors"
    src="https://img.shields.io/github/contributors/chrisdigity/mochimap.com?logo=github&label=Contributors&style=plastic"
  /><br /><img src="https://contrib.rocks/image?repo=chrisdigity/mochimap.com" /></a><br />
</h1>

The MochiMap API is a selfless service *(pats self on back)* provided to the [Mochimo](https://mochimo.org/) community, for access to Mochimo Block data, Transaction data, Chain statistics and Network Node details via secure and reliable HTTPS requests and JSON responses.

The MochiMap API interprets blockchain and transaction data from the Mochimo Cryptocurrency Network and stores it as Developer friendly JSON data. This data is publicly accessible via the MochiMap API endpoints, listed below, allowing for both simple and complex queries and search patterns for querying exactly the data you might need.

## API Status and Uptime
The [MochiMap API status page](https://stats.uptimerobot.com/KEPZ9hqnYo) is powered by the UptimeRobot and contains global and regional uptime history of the MochiMap API across all of it's publicly accessible servers.

## API Domains
The MochiMap API can be accessed using a few different domains. Though it's highly recommended that you use the recommended domain for almost all cases, alternative domains are spread across the globe for redundancy and backup requirements.

#### Recommended <sub>( api.mochimap.com )
Requests made to api.mochimap.com will redirected to the closest available regional domain, based on latency calculation, and is therefore the recommended domain for access to the MochiMap API.

#### Regional Alternatives
Alternatively, you can opt to use one of the various regional domains, via their associated region prefix. Regional domains are spread across the globe for redundancy and backup requirements, but requests made directly to these domains **WILL NOT be redirected to a working server in the case of downtime due to maintenance or a failure.** Regional domains currently reside in Germany, Singapore and United States under their respective domains listed below...
 - de.mochimap.com ~ ![Uptime Robot ratio (30 days) de.mochimap.com](https://img.shields.io/uptimerobot/ratio/m788515308-a9d2f32413b247378bcf2695?label=Uptime&logo=AIOHTTP&style=plastic)
 - sg.mochimap.com ~ ![Uptime Robot ratio (30 days) sg.mochimap.com](https://img.shields.io/uptimerobot/ratio/m788515360-2e1cf7221b57332febc23252?label=Uptime&logo=AIOHTTP&style=plastic)
 - us.mochimap.com ~ ![Uptime Robot ratio (30 days) us.mochimap.com](https://img.shields.io/uptimerobot/ratio/m788515370-ca620cc0578961bdd0dbb06f?label=Uptime&logo=AIOHTTP&style=plastic)

## API Endpoints <sub>( METHOD [domain]/request/path/and/parameters)
#### Get block data
  - **GET [base]/block/&lt;blockNumber&gt;**, where
  - &lt;blockNumber&gt; is left *blank* to obtain latest block data; or
  - &lt;blockNumber&gt; is a positive integer in base-10 or hex format
  - *e.g. get latest block data:*
    - *https://api.mochimap.com/block/*
  - *e.g. get block data for block number 287117:*
    - *https://api.mochimap.com/block/287117*
    - *https://api.mochimap.com/block/0x4618d*
  - **TYPICAL RESULT**
```json
{
  "_id": "000000000004618d-a2478305a3300850",
  "type": "normal",
  "size": 231804,
  "bnum": 287117,
  "time0": 1624655470,
  "stime": 1624655600,
  "difficulty": 34,
  "bhash": "a2478305a3300850...fb437c6e2583d69f",
  "phash": "7a819323892d94ba...0c48435f92f62546",
  "mroot": "5a5c07637d44b2a1...86aea762b7c21bd3",
  "nonce": "0eff0147a2013200...4b00000000000000",
  "maddr": "729fe006c47c498d...85a36ab38d5552f0",
  "mreward": 46407192000,
  "mfee": 500,
  "amount": 117279360901,
  "tcount": 26
}
```

#### Search for block data
  - **GET [base]/block/search[?&lt;parameter&gt;[:&lt;modifier&gt;]=&lt;value&gt;]**
    - where &lt;parameter&gt; is a property of the desired block data; and
    - where &lt;modifier&gt; is used to modify how a properties value is interpreted; and
    - where &lt;value&gt; is the associated property value used for the search
  - *e.g. search blocks containing more than 10 transactions, solved by addresses beginning with abc...*
    - *https://api.mochimap.com/block/search?tcount:gt=10&maddr:begins=abc*
  - *e.g. search pseudoblocks:*
    - *https://api.mochimap.com/block/search?type=pseudo*
  - **TYPICAL RESULT**
```json
{
  "duration": 393,
  "found": 2861,
  "pages": 358,
  "results": [
    {
      "_id": "0000000000046204-454a3938da3d09aa",
      "type": "pseudo",
      "size": 164,
      "bnum": 287236,
      "time0": 1624693012,
      "stime": 1624693961,
      "difficulty": 36,
      "bhash": "454a3938da3d09aa...303d8c7fecb7abc2",
      "phash": "7ec34c376c5cbd72...b6aa90d70a1973515"
    },
    { "...": "7 more results" }
  ]
}
```

#### Get chain data
  - **GET [base]/chain/&lt;blockNumber&gt;**, where
    - &lt;blockNumber&gt; is left *blank* to obtain latest chain data; or
    - &lt;blockNumber&gt; is a positive integer in base-10 or hex format
  - *e.g. get latest chain data:*
    - *https://api.mochimap.com/chain/*
  - *e.g. get chain data for block number 287117:*
    - *https://api.mochimap.com/chain/287117*
    - *https://api.mochimap.com/chain/0x4618d*
  - **TYPICAL RESULT**
```json
{
  "phash": "7a819323892d94ba...0c48435f92f62546",
  "bnum": 287117,
  "mfee": 500,
  "tcount": 26,
  "time0": 1624655470,
  "difficulty": 34,
  "mroot": "5a5c07637d44b2a1...86aea762b7c21bd3",
  "nonce": "0eff0147a2013200...4b00000000000000",
  "stime": 1624655600,
  "bhash": "a2478305a3300850...fb437c6e2583d69f",
  "txfees": 13000,
  "reward": 46407192000,
  "mreward": 46407205000,
  "blocktime": 130,
  "blocktime_avg": 313.81,
  "hashrate": 132152839,
  "hashrate_avg": 160158087,
  "aeonRewards": 6124358488000,
  "aeonPseudoblocks": 9,
  "maxSupply": 76031020786194600,
  "supply": 11423211134242192
}
```

#### Get hashed or tagged address details <sub> ( as available in ledger.dat )
  - **GET [base]/ledger/&lt;addressType&gt;/&lt;address&gt;**, where
    - &lt;addressType&gt; is either "address" or "tag"; and
    - &lt;address&gt; is a hashed or tagged address; respectively
  - *e.g. get ledger entry for address beginning with 287a8fb2:*
    - *https://api.mochimap.com/ledger/address/287a8fb2*
  - *e.g. get ledger entry for tagged address beginning with c0ffee:*
    - *https://api.mochimap.com/ledger/tag/c0ffee*
  - **TYPICAL RESULT**
```json
{
  "address": "26f879942289bf1a...c0ffeec0ffeec0ffeec0ffee",
  "addressHash": "8906b6df9148c437...20754fec72d55e09",
  "tag": "c0ffeec0ffeec0ffeec0ffee",
  "balance": 75456516340552
}
```

#### Search for ledger balance history
  - **GET [base]/ledger/search[?&lt;parameter&gt;[:&lt;modifier&gt;]=&lt;value&gt;]**
    - where &lt;parameter&gt; is a property of the desired ledger balance data; and
    - where &lt;modifier&gt; is used to modify how a properties value is interpreted; and
    - where &lt;value&gt; is the associated property value used for the search
  - *e.g. search ledger balances of tag beginning with c0ffee...*
    - *https://api.mochimap.com/ledger/search?tag:begins=c0ffee*
  - **TYPICAL RESULT**
```json
{
  "duration": 453,
  "found": 3,
  "pages": 1,
  "results": [
    {
      "_id": "0000000000046100-d87f31a16c521323-c0ffeec0ffeec0ffeec0ffee",
      "bhash": "d87f31a16c521323...4314f96bcb769ac5",
      "timestamp": 1624612231,
      "bnum": 286976,
      "address": "26f879942289bf1a...18698a0688380f6d",
      "addressHash": "8906b6df9148c437...20754fec72d55e09",
      "tag": "c0ffeec0ffeec0ffeec0ffee",
      "balance": 75456516340552,
      "delta": -2745000000500
    },
    { "...": "2 more results" }
  ]
}
```

#### Get network node details
  - **GET [base]/network/&lt;active&gt;/&lt;IPv4&gt;**, where
    - &lt;active&gt; is optionally added to obtain node details; ONLY if
      - the node is actively accessible as a Mochimo Network node
    - &lt;IPv4&gt; is an IPv4 address
  - *e.g. get network node details from 95.179.216.152 ONLY if active:*
    - *https://api.mochimap.com/network/active/95.179.216.152*
  - *e.g. get network node details from 95.179.216.152:*
    - *https://api.mochimap.com/network/95.179.216.152*
  - **TYPICAL RESULTS**
```json
{
  "_id": "95-179-216-152",
  "host": {
    "ip": "95.179.216.152",
    "port": 2095
  },
  "connection": {
    "de": {
      "status": 0,
      "ping": 1060,
      "baud": 132149,
      "timestamp": 1624711676837,
      "uptimestamp": 1624669216091
    },
    "sg": { "...": "like connection.de" },
    "us": { "...": "like connection.de" }
  },
  "pversion": 4,
  "cbits": 17,
  "network": 1337,
  "cblock": 287290,
  "cblockhash": "32a47b74f37af534...b7892b5b07a411e0",
  "pblockhash": "6154c72ca51ef252...dfcf6ef17c048ab7",
  "weight": "383a1381c9b55f696",
  "peers": [
    "207.180.222.97",
    "5.188.4.25",
    "35.208.22.197",
    "68.148.89.244",
    { "...": "28 more peers" }
  ]
}
```

#### Search for network nodes
  - **GET [base]/network/search[?&lt;parameter&gt;[:&lt;modifier&gt;]=&lt;value&gt;]**
    - where &lt;parameter&gt; is a property of the desired ledger balance data; and
    - where &lt;modifier&gt; is used to modify how a properties value is interpreted; and
    - where &lt;value&gt; is the associated property value used for the search
  - *e.g. find network nodes that are no longer connected to the network:*
    - *https://api.mochimap.com/network/search?connection.de.status=-1&cblock:exists=true*
  - **TYPICAL RESULTS**
```json
{
  "duration": 370,
  "found": 1,
  "results": [
    {
      "_id": "35-208-54-226",
      "host": {
        "ip": "35.208.54.226",
        "port": 2095
      },
      "connection": {
        "de": {
          "status": -1,
          "ping": null,
          "baud": null,
          "timestamp": 1623901791833,
          "uptimestamp": -1
        },
        "sg": { "...": "like connection.de" },
        "us": { "...": "like connection.de" }
      },
      "pversion": 4,
      "cbits": 17,
      "network": 1337,
      "cblock": 284651,
      "cblockhash": "89f3a64810f3995a...e7706ffc03e4ee4e",
      "pblockhash": "038dd5a9808597b1...5bf2d12c78cbd178",
      "weight": "383a0d15c9b55f696",
      "peers": [
        "217.76.158.158",
        "5.183.8.183",
        "144.91.67.74",
        "139.162.252.168",
        { "...": "28 more peers" }
      ]
    }
  ]
}
```

#### Get transaction data
  - **GET [base]/transaction/&lt;txid&gt;**, where
    - &lt;txid&gt; is the txid hash of a transaction
  - *e.g. get transaction data for txid ff3d5ba80aff9986...:*
    - *https://api.mochimap.com/transaction/ff3d5ba80aff99863861ebba2260542ab1713bd0552830db3f1e2351967251bb*
  - **TYPICAL RESULT**
```json
{
  "_id": "000000000004623e-93fade70ed2dd22c-ff3d5ba80aff9986...3f1e2351967251bb",
  "stime": 1624712529,
  "bnum": 287294,
  "bhash": "93fade70ed2dd22c...75d87045c191fd37",
  "txid": "ff3d5ba80aff9986...3f1e2351967251bb",
  "txsig": "01a66e54547cc557...fc522479381e6d3c",
  "srcaddr": "178c5780218b86f6...61469776a1f2e4e5",
  "srctag": "420000000e00000001000000",
  "dstaddr": "c1fb2c9c92ca9d98...8d6610adc3b0c48e",
  "dsttag": "420000000e00000001000000",
  "chgaddr": "83c3f1bb4edfda34...77fb96668959c154",
  "chgtag": "420000000e00000001000000",
  "sendtotal": 23707567877,
  "changetotal": 5368437937,
  "txfee": 500
}
```

#### Search for transactions
  - **GET [base]/transaction/search[?&lt;parameter&gt;[:&lt;modifier&gt;]=&lt;value&gt;][&]**
    - where &lt;parameter&gt; is a direct property of the transaction data; and
    - where &lt;modifier&gt; is used to modify how a property is interpreted; and
    - where &lt;value&gt; is the associated propety value used for the search
  - *e.g. find the latest transactions:*
    - *https://api.mochimap.com/transaction/search*
  - *e.g. find transactions where send total is greater than 1,000 MCM:*
    - *https://api.mochimap.com/transaction/search?sendtotal:gt=10000000000000*
  - **TYPICAL RESULT**
```json
{
  "duration": 1043,
  "found": 864,
  "pages": 108,
  "results": [
    {
      "_id": "0000000000045d3b-977c8ea2c489e591-1af7375c2707877d...40c4570ac2c056d9",
      "stime": 1624315034,
      "bnum": 286011,
      "bhash": "977c8ea2c489e591...63401099de418e54",
      "txid": "1af7375c2707877d...40c4570ac2c056d9",
      "txsig": "8cba76056f0fa0a5...086960d365758ff4",
      "srcaddr": "50693b379aac7535...481396d7bb7a322a",
      "srctag": "b0909e9738afec33d4a24a90",
      "dstaddr": "6127d05ef95819b3...3c80e28d112d4c2e",
      "dsttag": "c94dd1793727bb32d7521329",
      "chgaddr": "cea985ebcf365956...7df997654163ac64",
      "chgtag": "b0909e9738afec33d4a24a90",
      "sendtotal": 15899999999500,
      "changetotal": 501,
      "txfee": 500
    },
    { "...": "7 more results" }
  ]
}
```

## API Search Parameters
With the exception of Special Transaction Search Parameters (see below) and the "exists" Modifier (see further below), search parameters can be any field name contained within the expected JSON results. If the desired search parameter is not a top-level parameter, all parent fields names must be including and suffixed with a dot "." character (e.g. ?connection.de.status=0).

### Special Transaction Search Parameters:
Exclusively active when performing a Transaction Search, there are a couple of parameters which are interpreted indirectly. Valid special parameters are as follows:
  - **?address[:&lt;modifier&gt;]=&lt;value&gt;**; matches results where
    - srcaddr[:&lt;modifier&gt;]=&lt;value&gt;; or
    - dstaddr[:&lt;modifier&gt;]=&lt;value&gt;; or
    - chgaddr[:&lt;modifier&gt;]=&lt;value&gt;
      - *i.e. provides transaction history for an address*
  - **?tag[:&lt;modifier&gt;]=&lt;value&gt;**; matches results where
    - srctag[:&lt;modifier&gt;]=&lt;value&gt;; or
    - dsttag[:&lt;modifier&gt;]=&lt;value&gt;; or
    - chgtag[:&lt;modifier&gt;]=&lt;value&gt;
      - *i.e. provides transaction history for a tagged address*

## API Search Modifiers
Modifiers can optionally be appended to search parameters to modify how a search query interprets matching results. Usage of modifiers outside of this specification will be ignored. Valid modifiers are as follows:
  - **?&lt;parameter&gt;[:begins]=&lt;value&gt;**; matches results where
    - the &lt;parameter&gt; value "begins with" &lt;value&gt;
  - **?&lt;parameter&gt;[:contains]=&lt;value&gt;**; matches results where
    - the &lt;parameter&gt; value "contains" &lt;value&gt;
  - **?&lt;parameter&gt;[:ends]=&lt;value&gt;**; matches results where
    - the &lt;parameter&gt; value "ends with" &lt;value&gt;
  - **?&lt;parameter&gt;[:exists]=&lt;value&gt;**; matches results where
    - the &lt;parameter&gt;'s "existance" matches the specified Boolean &lt;value&gt;
      - i.e. where &lt;value&gt; = 'false' or is otherwise "falsy", results must not contain a &lt;parameter&gt; field
  - **?&lt;parameter&gt;[:gt]=&lt;value&gt;**; matches results where
    - the &lt;parameter&gt; value "is greater than" &lt;value&gt;
  - **?&lt;parameter&gt;[:gte]=&lt;value&gt;**; matches results where
    - the &lt;parameter&gt; value "is greater than or equal to" &lt;value&gt;
  - **?&lt;parameter&gt;[:lt]=&lt;value&gt;**; matches results where
    - the &lt;parameter&gt; value "is less than" &lt;value&gt;
  - **?&lt;parameter&gt;[:lte]=&lt;value&gt;**; matches results where
    - the &lt;parameter&gt; value "is less than or equal to" &lt;value&gt;
  - **?&lt;parameter&gt;[:ne]=&lt;value&gt;**; matches results where
    - the &lt;parameter&gt; value "is not equal to" &lt;value&gt;

*Note: the 'gt', 'gte', 'lt', 'lte' and 'ne' modifiers can produce unintended results when used with non-number type values*

## Need to get in contact? ~ ![Discord](https://img.shields.io/discord/460867662977695765?logo=discord&style=plastic)
[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2Fchrisdigity%2Fmochimap-api.svg?type=shield)](https://app.fossa.com/projects/git%2Bgithub.com%2Fchrisdigity%2Fmochimap-api?ref=badge_shield)
More often than not, you can find me online in the [Mochimo Official](https://discord.gg/7ma6Bk2) Discord Server.<br>
Otherwise, checkout my [Github profile](https://github.com/chrisdigity) for other forms of contact.

## License ~ ![License](https://img.shields.io/github/license/chrisdigity/mochimap.com?logo=Open%20Source%20Initiative&style=plastic)
This project is licensed under the GNU Affero General Public License version 3.<br>
... see the [LICENSE](LICENSE) file for details.


[![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2Fchrisdigity%2Fmochimap-api.svg?type=large)](https://app.fossa.com/projects/git%2Bgithub.com%2Fchrisdigity%2Fmochimap-api?ref=badge_large)
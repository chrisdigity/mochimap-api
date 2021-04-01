<h1 align="center">
  <sub>www</sub> MochiMap <sub>com</sub><br>
    <img alt="Website" src="https://img.shields.io/website?down_message=offline&logo=AIOHTTP&style=plastic&up_color=brightgreen&up_message=online&url=https%3A%2F%2Fwww.mochimap.com%2F">
    <img alt="W3C Validation" src="https://img.shields.io/w3c-validation/default?style=plastic&targetUrl=https%3A%2F%2Fwww.mochimap.com%2F">
    <img alt="GitHub contributors" src="https://img.shields.io/github/contributors/chrisdigity/mochimap.com?logo=github&style=plastic">
</h1>

Welcome to the home of MochiMap. MochiMap is a selfless service (*pats self on back*) provided to the [Mochimo](https://mochimo.org/) Cryptocurrency Network, as well as the network's community, in the form of:
 - a random [list](https://www.mochimap.net/startnodes.lst) of active network peers for (re)starting Mochimo Full Nodes
 - a unique form of visualizations for understanding and enjoying a cryptocurrency network
 - an open source explorer for the Mochimo Cryptocurrency Network

## The contents of this repository ~ ![GitHub language count](https://img.shields.io/github/languages/count/chrisdigity/mochimap.com?style=plastic) ![GitHub top language](https://img.shields.io/github/languages/top/chrisdigity/mochimap.com?style=plastic)
This repository hosts:
 - the [MochiMap.com](https://www.mochimap.com/) frontend hosted by GitHub Pages (see [docs/](docs/))
 - the MochiMap API backend hosted externally via Cloudflare

## API Usage
The MochiMap API interprets blockchain and transaction data from the Mochimo Cryptocurrency Network and stores it as Developer friendly JSON data. This data is publicly accessible via the MochiMap API endpoints listed below, allowing both direct queries and custom search patterns for querying data.

#### Endpoints <sub>*[base] = https://api.mochimap.com*
- Get standard/tagged address balance (as a ledger entry)
  - **GET [base]/balance/&lt;addressType&gt;/&lt;address&gt;**
    - where &lt;addressType&gt; is either "address" or "tag"; and
    - where &lt;address&gt; is a hashed or tagged address; respectively
  - *e.g. get ledger entry for address beginning with e4f249d0:*
    - *[base]/balance/address/e4f249d0 [:link:](https://api.mochimap.com/balance/address/e4f249d0)*
  - *e.g. get ledger entry for tagged address beginning with c0ffee:*
    - *[base]/balance/tag/c0ffee [:link:](https://api.mochimap.com/balance/tag/c0ffee)*
- Get specific block data
  - **GET [base]/block/&lt;blockNumber&gt;**
    - where &lt;blockNumber&gt; is an unsigned integer in base-10 or hex format
  - *e.g. get block data for block number 260208:*
    - *[base]/block/260208 [:link:](https://api.mochimap.com/block/260208)*
    - *[base]/block/0x3f870 [:link:](https://api.mochimap.com/block/0x3f870)*
- Search for blocks
  - **GET [base]/block/search[?&lt;parameter&gt;[:&lt;modifier&gt;]=&lt;value&gt;][&]**
    - where &lt;parameter&gt; is a direct property of the block data; and
    - where &lt;modifier&gt; is used to modify how a property is interpreted; and
    - where &lt;value&gt; is the associated propety value used for the search
  - *e.g. find the latest pseudoblocks:*
    - *[base]/block/search?type=pseudo; [:link:](https://api.mochimap.com/block/search?type=pseudo) or*
    - *[base]/block/search?tcount:exists=false [:link:](https://api.mochimap.com/block/search?tcount:exists=false)*
  - *e.g. find blocks containing more than 10 transactions, solved by 0540e5...*
    - *[base]/block/search?tcount:gt=10&maddr:begins=0540e5 [:link:](https://api.mochimap.com/block/search?tcount:gt=10&maddr:begins=0540e5)*
- Get specific transaction data
  - **GET [base]/transaction/&lt;txid&gt;**
    - where &lt;txid&gt; is the txid hash of a transaction
  - *e.g. get transaction data for txid 9467464bee48305586989d27d12fcd50...:*
    - *[base]/transaction/9467464bee48305586989d27d12fcd50967b07c48c81689d50789d08ad7ffd4c [:link:](https://api.mochimap.com/transaction/9467464bee48305586989d27d12fcd50967b07c48c81689d50789d08ad7ffd4c)*
- Search for transactions
  - **GET [base]/transaction/search[?&lt;parameter&gt;[:&lt;modifier&gt;]=&lt;value&gt;][&]**
    - where &lt;parameter&gt; is a direct property of the transaction data; and
    - where &lt;modifier&gt; is used to modify how a property is interpreted; and
    - where &lt;value&gt; is the associated propety value used for the search
  - *e.g. find transactions sending more than 100MCM:*
    - *[base]/transaction/search?sendtotal:gt=100000000000 [:link:](https://api.mochimap.com/transaction/search?sendtotal:gt=100000000000)*
  - *e.g. find transaction history of the tag 696c6c...*
    - *[base]/transaction/search?tag:begins=696c6c [:link:](https://api.mochimap.com/transaction/search?tag:begins=696c6c)*

#### API Search Parameters and Modifiers
With the exception of Special Parameters (see below) and the "exists" Modifier (see further below), search parameters must be any top-level field name contained within the expected JSON results. Usage of parameters outside of this specification will fail to produce results.

- Special Parameters are as follows:
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

Modifiers can (optionally) be appended to search parameters to modify how a search query interprets matching results. Usage of modifiers outside of this specification will be ignored.

- Modifiers are as follows:
  - **?&lt;parameter&gt;[:begins]=&lt;value&gt;**; matches results where
    - the &lt;parameter&gt; value "begins with" &lt;value&gt;
  - **?&lt;parameter&gt;[:contains]=&lt;value&gt;**; matches results where
    - the &lt;parameter&gt; value "contains" &lt;value&gt;
  - **?&lt;parameter&gt;[:ends]=&lt;value&gt;**; matches results where
    - the &lt;parameter&gt; value "ends with" &lt;value&gt;
  - **?&lt;parameter&gt;[:exists]=&lt;value&gt;**; matches results where
    - the &lt;parameter&gt;'s "existance" matches the specified Boolean &lt;value&gt;
      - i.e. where &lt;value&gt; = 'false' or "falsy", results must not contain a &lt;parameter&gt; field
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

*Note: the 'gt', 'gte', 'lt', 'lte' and 'ne' modifiers can produce unintended results when used with Number type values*

## Need to get in contact? ~ ![Discord](https://img.shields.io/discord/460867662977695765?logo=discord&style=plastic)
More often than not, you can find me online in the [Mochimo Official](https://discord.gg/7ma6Bk2) Discord Server.<br>
Otherwise, checkout my [Github profile](https://github.com/chrisdigity) for other forms of contact.

## License ~ ![License](https://img.shields.io/github/license/chrisdigity/mochimap.com?logo=Open%20Source%20Initiative&style=plastic)
This project is licensed under the GNU Affero General Public License version 3.<br>
... see the [LICENSE](LICENSE) file for details.

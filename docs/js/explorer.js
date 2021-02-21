/* eslint-env browser */
/* globals dCreate, dCreateIn, dAppendNamed, asUint64String, bSize, mcm */

var SOCKET = false;
var SocketMore = false;

function timeAgo(msecs) {
  var sup = function(str) { return '<sup>' + str + '</sup>' };
  var post = function(val) { return val > 1 ? 's' : '' };
  var now = Math.floor(((new Date).getTime() - msecs) / 1000);
  var min = (now / 60) | 0;
  var minStr = (min ? min + sup('min' + post(min)) : '') + ' ';
  var sec = now % 60;
  var secStr = (sec ? sec + sup('min' + post(sec)) : '') + ' ';
  return '<span>' + minStr + secStr + 'ago</span>';
}
function checkBottom() {
  var dElement = document.documentElement;
  var scrollTop = (dElement && dElement.scrollTop) || document.body.scrollTop;
  var scrollHeight = (dElement && dElement.scrollHeight) || document.body.scrollHeight;
  if ((scrollTop + window.innerHeight) >= scrollHeight) {
    if (SocketMore && SocketMore.type && SocketMore.request) {
      document.getElementById('loading').style.display = 'block';
      SOCKET.emit(SocketMore.type, SocketMore.request);
      SocketMore = false;
    }
  }
}
function socketSearch(e, form) {
  e.preventDefault();
  if (!SOCKET) return false;
  // get form values
  var filter = form.elements.namedItem('filter').value;
  var query = form.elements.namedItem('search').value;
  var content = document.getElementById('content');
  content.className = 'search';
  content.innerHTML = '';
  document.getElementById('loading').style.display = 'block';
  SOCKET.emit('bsummary', { bnum: query, depth: 1 });
  return false;
}
function connected(socket) { // eslint-disable-line no-unused-vars
  SOCKET = socket;
  socket.onAny(function (e, data) {
    switch (e) {
      case 'bsummary':
        // assign defaults to missing data
        var bhash = data.bhash || 'no_bhash';
        var phash = data.phash || 'no_phash';
        var maddr = data.maddr || 'no_maddr';
        var mreward = data.mreward || 0;
        var mfee = data.mfee || 0;
        var tcount = data.tcount || 0;
        var lcount = data.lcount || 0;
        var tmfee = tcount * mfee;
        var tamount = data.tamount || 0;
        var difficulty = data.difficulty || 0;
        //var time0 = data.time0 || 0;
        var stime = data.stime ? data.stime * 1000 : 0;
        var bnum = data.bnum || 0;
        var size = data.size || 0;
        var type = data.type || 'invalid';
        var haiku = data.haiku || 'no_haiku';
        var blockIcon = type === 'normal' ? 'cube' : type === 'pseudo' ? 'vector-square' : 'th';
        // build strings
        var elink = '/explorer/';
        var bquery = '?bnum=' + data.bnum + '&bhash=' + data.bhash.slice(0, 16);
        var mlink = elink + 'address/?addr=' + maddr.slice(0, 16);
        var blink = elink + 'block/' + bquery;
        var hlink = '/haiku/' + bquery;
        // append new block data as div
        var bup = dCreate({ class: 'grid-container ' + type, name: asUint64String(bnum) });
        dCreateIn(bup, { class: 'icon' }, '<i class="fas fa-3x fa-' + blockIcon + '"></i>');
        dCreateIn(bup, { class: 'bnum' }, '<span title="0x' + Number(bnum).toString(16) + '">' + bnum + '</span>');
        dCreateIn(bup, { class: 'tstamp' }, (new Date(stime)).toISOString().replace(/[.]\d+/, ''));
        dCreateIn(bup, { class: 'stime', name: 'stime', 'data-stime': stime }, '<span>' + timeAgo(stime) + '</span>');
        dCreateIn(bup, { class: 'bhash' }, '<span><span>Hash: 0x' + bhash + '"</span><span>Prev: 0x' + phash + '</span></span');
        if (type !== 'genesis' && type !== 'neogenesis') {
          dCreateIn(bup, { class: 'diff' }, '<span>⚠ Difficulty: ' + difficulty + '</span>');
        }
        if (type === 'normal') {
          dCreateIn(bup, { class: 'mdata' }, '<span>⛏  Miner: <a href="' + mlink + '">' + maddr + '</a></span>');
          dCreateIn(bup, { class: 'mreward' }, '<span><i class="fas fa-donate"></i> <span title="Block Reward: ' + mcm(mreward, false, true) + '">' + mcm(mreward) + '</span> <sup title="' + tcount + 'Transactions x ' + mcm(mfee) +' Transaction Fee">+' + mcm(tmfee) + '</sup></span>');
          dCreateIn(bup, { class: 'tcount' }, '<span>血 Transactions: ' + tcount.toLocaleString() + ' <i class="fas fa-exchange-alt"></i> ' + mcm(tamount) + '</span>');
          dCreateIn(bup, { class: 'bsize' }, '<span>⚖ Block Size: ' + bSize(size) + '</span>');
        } else if (type === 'genesis' || type === 'neogenesis') {
          dCreateIn(bup, { class: 'lcount' }, '<span>血 Ledger Entries: ' + lcount + '</span>');
          dCreateIn(bup, { class: 'supply' }, '<span><i class="fas fa-piggy-bank"></i> Supply: ' + mcm(tamount) + '</span>');
          dCreateIn(bup, { class: 'bsize' }, '<span>⚖ Block Size: ' + bSize(size) + '</span>');
        }
        // prepend block data elements
        var parent = document.getElementById('content');
        dAppendNamed(parent, bup);
        break;
      case 'done':
        document.getElementById('loading').style.display = 'none';
        SocketMore = data;
        break;
    }
  });
  /*
  socket.on('transactionUpdate', function (txe) {
    var txid = txe.txid || 'no_txid';
    var src = txe.src || 'no_source';
    var dst = txe.dst || 'no_destination';
    var chg = txe.chg || 'no_change';
    var sendtotal = txe.sendtotal || 0;
    // build links
    var bquery = '?bnum=' + txe.bnum + '&bhash=' + txe.bhash.slice(0, 16);
    var tlink = '/explorer/transaction/' + bquery + '&txid=' + txid.slice(0, 16);
    var slink = '/explorer/address/?addr=' + src.slice(0, 16);
    var dlink = '/explorer/address/?addr=' + dst.slice(0, 16);
    var clink = '/explorer/address/?addr=' + chg.slice(0, 16);
    // append new block data as description list
    var dt = dCreate('dt');
    dCreateIn(dt, 'a', { href: tlink }, 'TxID 0x' + txe.txid.slice(0, 16) + '...');
    dCreateIn(dt, 'span', { class: 'stime' }, 'on Block #' + txe.bnum);
    // create description list for block
    var dd = dCreate('dd');
    if (src.length > 24) {
      dCreateIn(dd, 'a', { title: 'WOTS+ Address: ' + src + '...' }, 'ω+' + src.slice(0, 24) + '...');
    } else dCreateIn(dd, 'a', { title: 'Tagged Address: ' + src }, 'τ.' + src);
    var dest = dCreateIn(dd, 'div', null, '⤷ sent ' + mcm(sendtotal) + ' to ');
    if (dst.length > 24) {
      dCreateIn(dest, 'a', { title: 'WOTS+ Address: ' + dst + '...' }, 'ω+' + dst.slice(0, 24) + '...');
    } else dCreateIn(dest, 'a', { title: 'Tagged Address: ' + dst }, 'τ.' + dst);
    // append block data elements
    var parent = document.getElementById('transactions');
    dAppendNamed(parent, bup, 16);
  });
  */
  // request latest data
  socket.emit('bsummary');
}
// detect bottom of the page and load more
window.addEventListener('wheel', checkBottom);
window.addEventListener('touchMove', checkBottom);
// update stime cells using timeAgo()
window.addEventListener('load', function updateStime() {
  var elements = document.getElementsByName('stime');
  if (elements.length) {
    elements.forEach(function (element) {
      element.innerHTML = timeAgo(Number(element.getAttribute('data-stime')));
    });
  }
  setTimeout(updateStime, 1000);
});
/* eslint-env browser */
/* globals dCountIn, dCreate, dCreateIn, statusOk, bSize, mcm */

function connected(socket) { // eslint-disable-line no-unused-vars
  socket.on('latestBlock', function (block) {
    statusOk('connected');
    // assign defaults to missing data
    var bhash = block.bhash ? block.bhash.slice(0, 16) : 'no_bhash';
    var phash = block.phash ? block.phash.slice(0, 16) : 'no_phash';
    var maddr = block.maddr ? block.maddr.slice(0, 16) : 'no_maddr';
    var mreward = block.mreward || 0;
    var mfee = block.mfee || 0;
    var tcount = block.tcount || 0;
    var tmfee = tcount * mfee;
    var tsendamount = block.tsendamount || 0;
    var difficulty = block.difficulty || 0;
    //var time0 = block.time0 || 0;
    var stime = block.stime ? block.stime * 1000 : 0;
    var bnum = block.bnum || 0;
    var size = block.size || 0;
    var type = block.type || 'invalid';
    var haiku = block.haiku || 'no_haiku';
    // build links
    var bquery = '?bnum=' + block.bnum + '&bhash=' + block.bhash.slice(0, 16);
    var blink = '/explorer/block/' + bquery;
    var hlink = '/haiku/' + bquery;
    // append new block data as description list
    var dt = dCreate('dt');
    dCreateIn(dt, 'a', { class: 'btype-' + type, href: blink }, 'Block #' + bnum);
    dCreateIn(dt, 'span', { class: 'stime', name: 'stime', 'data-stime': stime });
    // create description list for block
    var dd = dCreate('dd');
    if (type === 'normal') {
      var mdata = dCreateIn(dd, 'div', null, '⛏ Miner: ');
      dCreateIn(mdata, 'a', { href: '/address/?addr=' + maddr }, maddr + '...');
      dCreateIn(mdata, 'span', { title: 'Block Reward: ' + mcm(mreward, 0, 1)}, ' ' + mcm(mreward));
      dCreateIn(mdata, 'sup', { title: tcount + ' Transactions x ' + mcm(mfee) + ' Network Fee' }, ' +' + mcm(tmfee, 1));
      dCreateIn(
        dCreateIn(dd, 'div', null, '血 Transactions: ' + tcount + ' ⥂ '),
        'span', null, mcm(tsendamount) + ' sent');
      dCreateIn(dd, 'a', { class: 'haiku', href: hlink }, haiku);
    }
    dCreateIn(dd, 'div', null, '⚠ Difficulty: ' + difficulty);
    var o = dCreateIn(dd, 'div', { class: 'smaller' });
    dCreateIn(o, 'div', { title: bSize(size, 1) }, '⚖ Block Size: ' + bSize(size));
    dCreateIn(o, 'div', { title: block.bhash }, '# Block Hash: ' + bhash + '...');
    dCreateIn(o, 'div', { title: block.phash }, '# Prev. Hash: ' + phash + '...');
    // append block data elements
    var parent = document.getElementById('blocks');
    if (parent.firstElementChild) {
      parent.insertBefore(dd, parent.firstElementChild);
    } else parent.appendChild(dd);
    parent.insertBefore(dt, dd);
    // remove excess elements
    var excess = dCountIn(parent) - 10;
    for (var i = 0; i < excess; i++) {
      parent.removeChild(parent.lastChild);
    }
  });
  // request latest data
  socket.emit('explorer');
}

function timeAgo(msecs) {
  var now = Date.now();
  return Math.floor((now - msecs) / 1000) + ' seconds ago';
}

window.addEventListener('load', function updateStime() {
  var elements = document.getElementsByName('stime');
  if (elements.length) {
    elements.forEach(function (element) {
      var msecs = Number(element.getAttribute('data-stime'));
      var sdate = new Date(msecs);
      element.innerHTML = sdate.toUTCString() + '<br>' + timeAgo(msecs);
    });
  }
  setTimeout(updateStime, 1000);
});
/* eslint-env browser */
/* globals dCreate, dCreateIn, trunc, statusOk */

function connected(socket) { // eslint-disable-line no-unused-vars
  socket.on('latestBlock', function (block) {
    statusOk('connected');
    // modify recv'd data, as necessary
    var bquery = '?bnum=' + block.bnum + '&bhash=' + block.bhash.slice(0, 16);
    var type = block.type;
    var bnum = block.bnum;
    var time = block.time0 * 1000;
    var stime = block.stime * 1000;
    var maddr = block.maddr ? trunc(block.maddr, 32) : '';
    var mreward = block.mreward ? mochi(block.mreward) : '';
    var haiku = block.haiku ? block.haiku : '';
    var tcount = block.tcount;
    var mfee = block.mfee;
    var difficulty = block.difficulty;
    var bhash = trunc(block.bhash, 16);
    var phash = trunc(block.phash, 16);
    var mroot = trunc(block.mroot, 16);
    var nonce = block.nonce.slice(0, 32).replace(/0+$/g, '') + '...';
    // append new block data as description list
    var dt = dCreate('dt');
    dCreateIn(dt, 'a', { class: 'btype-' + type, href: '/explorer/block/' + bquery }, 'Block #' + bnum);
    dCreateIn(dt, 'span', { class: 'stime' }, null, (new Date(stime)).toUTCString() + '<br>' + (Date.now() - stime) / 1000 + ' seconds ago');
    // create description list for block
    var dd = dCreate('dd');
    if (block.type === 'normal') {
      dCreateIn(dd, 'div', { class: 'difficulty' }, difficulty);
      dCreateIn(dd, 'div', { class: 'maddr', title: block.maddr }, maddr);
      dCreateIn(
        dCreateIn(dd, 'div', { class: 'mreward', title: block.mreward }, mreward),
        'sup', { class: 'mfee' }, mfee);
      dCreateIn(dd, 'a', { class: 'haiku', href: '/haiku/' + bquery }, haiku);
      dCreateIn(dd, 'div', { class: 'tcount' }, tcount);
      dCreateIn(dd, 'div', { class: 'bhash', title: block.bhash }, bhash);
      dCreateIn(dd, 'div', { class: 'phash', title: block.phash }, phash);
      dCreateIn(dd, 'div', { class: 'mroot', title: block.mroot }, mroot);
      dCreateIn(dd, 'div', { class: 'nonce', title: block.nonce }, nonce);
    } else {
      dCreateIn(dd, 'div', { class: 'difficulty' }, difficulty);
      dCreateIn(dd, 'div', { class: 'bhash', title: block.bhash }, bhash);
      dCreateIn(dd, 'div', { class: 'phash', title: block.phash }, phash);
    }
    // append block data elements
    var parent = document.getElementById('blocks');
    if (parent.firstElementChild) {
      parent.insertBefore(dd, parent.firstElementChild);
    } else parent.appendChild(dd);
    parent.insertBefore(dt, dd);
  });
  // request latest data
  socket.emit('explorer');
}
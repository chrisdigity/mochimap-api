/* eslint-env browser */
/* eslint-disable no-unused-vars */
/* global BigInt */

function asUint64String (bigint) {
  // force unsigned 64bigint value
  return BigInt.asUintN(64, BigInt(bigint)).toString(16).padStart(16, '0');
}

function dCountIn(parent, depth) {
  var count = 0;
  var children = parent.childNodes.length;
  // iterate children
  for(var i = 0; i < children; i++) {
    // ignore textNodes
    if(parent.childNodes[i].nodeType != 3) {
      // check depth
      if(depth) count += dCountIn(parent.childNodes[i], depth - 1);
      count++;
    }
  }
  return count;
}

function dAppendNamed(parent, child, max) {
  // sort through children to find insertion position
  var children = parent.children;
  var len = children.length;
  var insertBefore = null;
  for (var i = 0; i < len; i++) {
    if (!children[i].getAttribute('name')) continue;
    if (children[i].getAttribute('name').localeCompare(child.getAttribute('name')) < 1) {
      insertBefore = children[i];
      break;
    }
  }
  // if no position found, append
  if (insertBefore === null) parent.appendChild(child);
  else parent.insertBefore(child, insertBefore);
  // remove excess elements
  if (typeof max === 'undefined') return;
  var excess = dCountIn(parent) - max;
  for (var j = 0; j < excess; j++) {
    parent.removeChild(parent.lastChild);
  }
}

function dCreate(attr, html) {
  // set defaults
  attr = attr || {};
  // create element type
  var element = document.createElement('div');
  //set attributes
  Object.keys(attr).forEach(function (key) {
    element.setAttribute(key, attr[key]);
  });
  // set html
  if (html) element.innerHTML = html;
  return element;
}

function dCreateIn(parent, attr, html) {
  var element = dCreate(attr, html);
  parent.appendChild(element);
  return element;
}

function bSize(size, bytes) {
  size = size || 0;
  var unit = 'Bytes';
  if (size && !bytes) {
    var k = 1000; // 1024 for Ki, Mi, Gi, etc...
    var mult = Math.floor(Math.log(size) / Math.log(k));
    size /= Math.pow(k, mult);
    unit = ['','K','M','G','T','P','E','Z','Y'][mult] + unit;
  }
  return size.toLocaleString() + ' ' + unit;
}

function mcm(bigint, forceNano, nolocale) {
  bigint = bigint || 0;
  var unit = 'MCM';
  if (bigint > 999999999 && !forceNano) bigint /= 1000000000;
  else unit = 'η' + unit;
  return (nolocale ? bigint : Number(bigint).toLocaleString()) + ' ' + unit;
}

function getUrlParameter(name) {
    name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
    var regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
    var results = regex.exec(location.search);
    return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
}
/* eslint-env browser */
/* eslint-disable no-unused-vars */

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

function dCreate(type, attr, text, html) {
  // set defaults
  type = type || 'div';
  attr = attr || {};
  // create element type
  var element = document.createElement(type);
  //set attributes
  Object.keys(attr).forEach(function (key) {
    element.setAttribute(key, attr[key]);
  });
  // set text or html
  if (text) element.textContent = text;
  else if (html) element.innerHTML = html;
  return element;
}

function dCreateIn(parent, type, attr, text, html) {
  var element = dCreate(type, attr, text, html);
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
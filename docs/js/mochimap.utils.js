/* eslint-env browser */
/* eslint-disable no-unused-vars */

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

function trunc(text, max) {
  return text.substr(0, max - 1) + (text.length > max ? '...' : '');
}

function mochi(bigint) {
  var whole = bigint.length > 9 ? bigint.slice(0, -9) : '0';
  var decimal = bigint.slice(-9).padStart(9, '0').replace(/0+$/g, '');
  return whole + (decimal ? '.' + decimal : '');
}

function getUrlParameter(name) {
    name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
    var regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
    var results = regex.exec(location.search);
    return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
}
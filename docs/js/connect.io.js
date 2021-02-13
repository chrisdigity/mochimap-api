/* eslint-env browser */
/* globals connected, io, grecaptcha */
var serverio = 'https://io.mochimap.com/';

var statusInfo = function (msg) {
  var status = document.getElementById('connection');
  if (status !== null) {
    status.textContent = '~' + msg;
    status.style.animation = 'flash-fade 2s infinite';
  }
};

var statusOk = function (msg) {
  var status = document.getElementById('connection');
  if (status !== null) {
    status.textContent = '~' + msg;
    status.style.animation = 'flash-dim-green 2s infinite';
  }
};

var statusWait = function (msg) {
  var status = document.getElementById('connection');
  if (status !== null) {
    status.textContent = '~' + msg;
    status.style.animation = 'flash-fade-orange 2s infinite';
  }
};

var statusError = function (msg) {
  var status = document.getElementById('connection');
  if (status !== null) {
    status.textContent = '~' + msg;
    status.style.animation = 'flash-fade-red 2s infinite';
  }
};

var connectio = function (token) {
  if (typeof token !== 'string') {
    throw new TypeError('connectio() expected token string, got ' + token);
  }
  // initialize SocketIO
  if (typeof io === 'undefined') {
    statusInfo('loading');
    return setTimeout(connectio.bind(null, token), 100);
  } else if(io instanceof Error) return statusError(io.message);
  // connect SocketIO
  var socket;
  try {
    statusInfo('connecting');
    var options = { auth: { token: token } };
    socket = io(serverio, options);
  } catch (error) { statusError(error); }
  // SocketIO events
  socket.on('wait', function (message) { statusWait(message); });
  socket.on('error', function (error) { statusError(error.message || error); });
  socket.on('disconnect', function () { statusError('disconnected'); });
  socket.on('connect_error', function (error) { statusError(error); });
  socket.on('connect', function () {
    statusOk('connected');
    if (typeof connected === 'function') connected(socket);
  });
};

var grecaptchaOnload = function () { // eslint-disable-line no-unused-vars
  statusInfo('authenticating');
  grecaptcha.execute('6LdMDwgaAAAAAOJxtiuLXOMu3GUNRLK-ZG6dq0oc', {
    action: 'homepage'
  }).then(connectio);
};

// initialize reCaptcha V3
var reCaptchaV3 = document.createElement('script');
reCaptchaV3.setAttribute('defer', '');
reCaptchaV3.setAttribute('async', '');
reCaptchaV3.src = 'https://www.recaptcha.net/recaptcha/api.js?onload=grecaptchaOnload&render=6LdMDwgaAAAAAOJxtiuLXOMu3GUNRLK-ZG6dq0oc';

// determine accessibility using a simple favicon download
var googleok = new Image();
googleok.onerror = function () {
  // adjust recaptcha API source domain for countries with restricted access
  window.__recaptcha_api = 'https://www.recaptcha.net/recaptcha/';
};
googleok.src = 'https://www.google.com/favicon.ico';

// add event listener for script addition
window.addEventListener('DOMContentLoaded', function () {
  // add scripts to head
  statusInfo('initializing');
  document.head.appendChild(reCaptchaV3);
});

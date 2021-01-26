/* eslint-env browser */

/* globals io, grecaptcha */

var socket;

var stopLoadFx = function () {
  document.getElementsByName('loadFX').forEach(function (fx) {
    fx.removeAttribute('loop');
  });
};

var hideLoadFx = function () {
  document.getElementsByName('loadFX').forEach(function (fx) {
    fx.style.display = 'none';
  });
};

var playConnectFx = function () {
  document.getElementsByName('connectFX').forEach(function (fx) {
    fx.play();
  });
};

var statusOk = function (msg) {
  document.getElementsByName('status').forEach(function (status) {
    status.textContent = msg;
  });
};

var statusError = function (msg) {
  document.getElementsByName('status').forEach(function (status) {
    status.textContent = msg;
    status.style.animation = 'flash-fade-red 2s infinite';
  });
};

var connectio = function (token) {
  /* initialize SocketIO */
  if (typeof io === 'undefined') {
    statusOk('loading');
    return setTimeout(connectio.bind(null, token), 1000);
  }
  /* connect SocketIO */
  try {
    statusOk('connecting');
    socket = io('https://io.mochimap.com:2053/', { auth: { token } });
  } catch (error) {
    statusError(error);
    stopLoadFx();
  }
  /* SocketIO events */
  socket.on('connect', function () {
    statusOk('connected');
    // trigger animations
    hideLoadFx();
    playConnectFx();
  });
  socket.on('connect_error', function (error) {
    stopLoadFx();
    statusError(error);
  });
};

var grecaptchaOnload = function () { // eslint-disable-line no-unused-vars
  statusOk('authenticating');
  const key = '6LdMDwgaAAAAAOJxtiuLXOMu3GUNRLK-ZG6dq0oc';
  grecaptcha.execute(key, { action: 'homepage' }).then(connectio);
};

// initialize reCaptcha V3
var reCaptchaV3 = document.createElement('script');
reCaptchaV3.setAttribute('defer', '');
reCaptchaV3.setAttribute('async', '');
reCaptchaV3.src = 'https://www.recaptcha.net/recaptcha/api.js?onload=grecaptchaOnload&render=6LdMDwgaAAAAAOJxtiuLXOMu3GUNRLK-ZG6dq0oc';

// initialize SocketIO (from server)
var socketio = document.createElement('script');
socketio.setAttribute('defer', '');
socketio.setAttribute('async', '');
socketio.src = 'https://io.mochimap.com:2053/socket.io/socket.io.js';

// determine accessibility using a simple favicon download
var googleok = new Image();
googleok.onerror = function () {
  // adjust recaptcha API source domain for countries with restricted access
  window.__recaptcha_api = 'https://www.recaptcha.net/recaptcha/';
};
googleok.src = 'https://www.google.com/favicon.ico';

// add event listener for script addition
window.addEventListener('load', function () {
  // add scripts to head
  document.head.appendChild(reCaptchaV3);
  document.head.appendChild(socketio);
});

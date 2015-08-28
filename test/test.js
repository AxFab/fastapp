

(function () {

  var assert = require('assert'),
      fs = require('fs'),
      fastapp = require('fastapp'),
      fapp = fastapp.noConflict();

  var testBuilding = function (num) {
    var ctx = fapp.QryCtx(null, { dir:'./test' });
    fapp.buildFile ('./test/test'+num+'.html', ctx, function (err, data) {
      if (err) return console.log(err)
      fs.writeFile('./test/build'+num+'.html', data);
      fs.readFile('./test/expect'+num+'.html', function(err, expect) {
        // assert (data == expect);
      })
    });
  }

  var testFailureBuilding = function (num) {
    var ctx = fapp.QryCtx(null, { dir:'./test' });
    fapp.buildFile ('./test/failed'+num+'.html', ctx, function (err, data) {
      assert (err != null);
    });
  }

  testBuilding('01');
  testBuilding('02');
  testBuilding('03');
  testFailureBuilding('01');
  testFailureBuilding('02');
  testFailureBuilding('03');
  testFailureBuilding('04');

  var listen = fapp.listenAt('./test')
  var req = {
    url: '/test01.html',
    path: '/test01.html',
    method: 'GET',
    headers: {
      cookie:'SSID=7b4e2c5;lang=eo;Connected',
      'accept-language': 'en-US,en;q=0.5'
    },
    opt: {}
  };

  var res = {
    send: function(err, data) { },
    on: function(what, func) { func() },
    statusCode:200,
  }

  fapp.tracing(req, res)
  fapp.searchInfo(req, res)

  listen(req, res)

}).call(this)

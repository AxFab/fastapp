

(function () {

  var assert = require('assert'),
      fs = require('fs'),
      vm = require('vm'),
      fapp = require('../lib/fastapp.js');

  var testExport = function (script) {
    // TODO improve poratability test and try to get coverage.
    require('../'+ script).noConflict();

    var sandbox = {
      require: function(name) {
        if (name[0] === '.') {
          return require('../lib/' + name);  
        }
        return require(name);
      }
    }

    sandbox = vm.createContext(sandbox)
    fs.readFile(script, function (err, data) {      
      assert(!err);
      vm.runInContext(data, sandbox);
    })
  }

  testExport('lib/fastapp.js');
  testExport('lib/markupcmd.js');
  testExport('lib/qryctx.js');


  var testBuilding = function (num) {
    var ctx = fapp.QryCtx(null, { dir:'./test' });
    fapp.buildFile ('./test/test'+num+'.html', ctx, function (err, data) {
      if (err) { return console.log(err); }
      // fs.writeFile('./test/build'+num+'.html', data);
      fs.readFile('./test/expect'+num+'.html', function(err, expect) {
        assert (data === expect.toString(), 'Failed test n ' + num);
      })
    });
  }

  var testFailureBuilding = function (num) {
    var ctx = fapp.QryCtx(null, { dir:'./test' });
    fapp.buildFile ('./test/failed'+num+'.html', ctx, function (err, data) {
      assert (err != null, 'Expect to fail ' + num + ", got:\n" + data);
    });
  }

  testBuilding('01');
  testBuilding('02');
  testBuilding('03');
  testBuilding('04');
  testBuilding('05');
  testFailureBuilding('01');
  testFailureBuilding('02');
  testFailureBuilding('03');
  testFailureBuilding('04');
  testFailureBuilding('05');
  testFailureBuilding('06');
  testFailureBuilding('07');
  testFailureBuilding('08');
  testFailureBuilding('09');
  testFailureBuilding('10');

  var listen1 = fapp.listenAt('./test')
  var listen2 = fapp.listenDir('./test/<page>.html', 'page')
  var req = {
    url: '/test01.html',
    path: '/test01.html',
    method: 'GET',
    params: {
      page:'test01'
    },
    headers: {
      cookie:'SSID=7b4e2c5;lang=eo;Connected',
      'accept-language': 'en-US,en;q=0.5'
    },
    opt: {}
  };

  var res = {
    send: function() { },
    on: function(what, func) { func() },
    statusCode:200,
  };

  fapp.tracing(req, res);
  fapp.searchInfo(req, res);
  fapp.parseCookies(req, res);

  fapp.tracing(req, res, function() { });
  fapp.searchInfo(req, res, function() { });
  fapp.parseCookies(req, res, function() { });

  listen1(req, res);
  listen2(req, res);

  fapp.buildFile('./test/test01.html', null, function () {
  });

}).call(this)

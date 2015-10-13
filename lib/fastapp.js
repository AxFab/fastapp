/*
*   FastApp
* Copyright 2014-2015 Fabien Bavent
* Released under the BSD 3-Clause license
*/
(function () {
  var previous_mod, root = this;
  if (root !== null) {
    previous_mod = root.FastApp;
  }

  var fs = require('fs'),
      async = require('async'),
      QryCtx = require('./qryctx.js'),
      MarkupCommands = require('./markupcmd.js');

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
//      P A G E   E N G I N E
// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=

  var FastApp = function () 
  {
  };

  FastApp.QryCtx = QryCtx;

  FastApp.tracing = function (req, res, next)
  {
    res._startAt = new Date().getTime();
    res.on('finish', function () {
      res._endAt = new Date().getTime();
      res.elapsed = res._endAt - res._startAt;
      console.log(res.statusCode + ' ' + req.method + ' ' + req.path + ' ' + res.elapsed + 'ms');
    });

    if (next) {
      next();
    }
  };

  FastApp.parseCookies = QryCtx.parseCookies;


  FastApp.searchInfo = function(req, res, next) 
  {
    req.opt = {
      lang: 'fr'
    };

    var langs = req.headers['accept-language'].split(',');
    // console.log ('LANGUAGE', langs[0].substring(0, 2))
    langs.forEach(function () {
      console.log ('Lg', arguments);
    });

    if (next) {
      next();
    }
  };


  FastApp.parseMarkup = function(mark) 
  {
    var tag = mark.substring(2);
    var c = '';
    
    var trimStart = function () {
      var i = 0;
      while (tag[i] <= ' ') { ++i; }
      if (i > 0) {
        tag = tag.substring(i);
      }
    };

    var getToken = function () {
      var str = '';
      var i = 0;
      while (tag[i] !== ':' && (tag[i] !== '/' || tag[i+1] !== '}')) { ++i; }
      if (i > 0) { 
        str = tag.substring(0, i);
        tag = tag.substring(i);
      }

      return str.match(/^\s*(.*)\s*$/)[1];
    };

    trimStart();

    var i = 0;
    while (tag[i] > ' ') { ++i; }
    if (i > 0) {
      c += tag.substring(0, i);
      tag = tag.substring(i);
    }
    
    if (c === '/}') {
      console.warn('Empty tag');
      return '';
    }
    
    var command = c;
    var args = [];
    for (;;) {
      trimStart();
      args.push(getToken());
      
      if (tag.match(/^\/}/)) {
        return {type:command, value:args };
      }

      tag = tag.substring(1);
    }
  };

  FastApp.buildFile = function (path, ctx, callback)
  {
    if (!ctx) { 
      ctx = new QryCtx();
    }

    // console.log ('-->', path)
    fs.readFile(path, function (err, data) {
      if (err) { return callback(err); }

      data = data.toString();
      var contentArray = [];
      var template = null;
      var commands = [];

      for(;;) {
        // Search for a markup command
        var l = data.match(/#\{.*\/\}/);
        if (l === null) { break; }
        if (l.index > 0) {
          contentArray.push(data.substring(0, l.index));
        }

        data = data.substring (l.index + l[0].length);

        // Parse command
        var cmd = FastApp.parseMarkup(l[0]);
        contentArray.push(cmd);
        if (cmd.type !== 'extends') {
          commands.push(cmd);
        } else {
          template = cmd;
        }
      }

      // Push the rest of the file
      contentArray.push(data);

      // Regroup page parts
      if (commands.length === 0) {
        if (template) {
          MarkupCommands.extends(template, ctx);
        }
        FastApp.regroup(contentArray, ctx, callback);
      } else {
        // Launch all commands
        // console.log('Launch all commands', path);
        async.each(commands, function (cmd, cb) {
          if (!MarkupCommands[cmd.type]) {
            return cb(new Error('Command '+cmd.type+' doesn\'t exist.'));
          }
          MarkupCommands[cmd.type](cmd, ctx, cb);
        }, function (err) {
          // console.log('Finished all commands', path);
          if (err) { return callback(err); }
          if (template) {
            MarkupCommands.extends(template, ctx);
          }
          FastApp.regroup(contentArray, ctx, callback);
        });
      }
    });
  };

  FastApp.regroup = function (array, ctx, callback)
  {
    var data = '';
    for (var i=0; i < array.length; ++i) {
      if (typeof array[i] === 'string') {
        data += array[i];
      } else if (array[i].data) {
        data += array[i].data;
      }
    }

    if (!ctx.__parent) {
      callback (null, data);
    } else {
      ctx.__modelData = data;
      var url = ctx.getUrl(ctx.__parent);
      ctx.__parent = null;
      if (!url) {
        return callback('Unable to find parent page');
      }
      FastApp.buildFile(url, ctx, callback);
    }
  };


  FastApp.respondPage = function (res, url, ctx)
  {
    FastApp.buildFile(url, ctx, function (err, data) {
      if (err) {
        // res.writeHead(500, headers);
        return res.send(''); // TODO Handle 404 / 403 / 500 ...
      }

      // TODO -- deflate if accepted!
      // res.setHeader('content-length', data.length);
      // res.setHeader('content-type', 'text/html');
      // res.writeHead(200, headers)
      res.send(data);
    });
  };

  FastApp.listenAt = function (directory)
  {
    return function (req, res) {
      var page = req.url;
      var ctx = new QryCtx(req, { dir:directory, lang:req.opt.lang });
      var url = ctx.getUrl(page);
      FastApp.respondPage(res, url, ctx);
    };
  };

  FastApp.listenDir = function (path, param)
  {
    return function (req, res) {
      var page = req.params[param];
      var ctx = new QryCtx(req, { path:path, lang:req.opt.lang });
      var url = ctx.getUrl(page);
      FastApp.respondPage(res, url, ctx);
    };
  };

  MarkupCommands.buildFile = FastApp.buildFile;

// ==========================================================================
  FastApp.noConflict = function () 
  {
    root.FastApp = previous_mod;
    return FastApp;
  };

  if (typeof module !== 'undefined' && module.exports) { // Node.js
    module.exports = FastApp;
  } else { // Browser
    root.FastApp = FastApp;
  }
  
}).call(this);

// ------------------------------------------------------------------------
// ------------------------------------------------------------------------

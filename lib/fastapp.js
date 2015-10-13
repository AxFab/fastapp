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
      async = require('async');

  var arrayIncludes = function (array, search, index) 
  {
    if (!index) {
      index = 0;
    }

    for (;index < array.length; ++index) {
      if (array[index] === search) {
        return true;
      }
    }
    
    return false;
  };


// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
//      P A G E   B U I L D I N G   C O N T E X T
// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=

  var CachingPolicy = {
    STATIC: 0,
    QUERY: 1,
    SESSION: 2,
    VOLATILE: 3,
  };

  var QryCtx = function (req, opt)
  {
    if (!(this instanceof QryCtx)) {
      return new QryCtx(req, opt);
    }

    if (!req) {
      req = { 
        query:{},
        cookie: {},
        headers: {},
      };
    }

    if (!opt) {
      opt = {};
    }

    FastApp.parseCookies(req);
    this.reset(req);
    this.__opt = opt;
  };

  QryCtx.prototype.reset = function(req) 
  {
    this.__data = {
      query: req.query,
      session: {},
      data: {},
    };

    this.__caching = CachingPolicy.STATIC;
  };

  QryCtx.prototype.getUrl = function (name) 
  {
    var url = null;
    if (this.__opt.path) {
      url = this.__opt.path;
      url = url.replace(/<page>/g, name);

    } else if (this.__opt.dir) {
      url = this.__opt.dir + '/' + name;
    }

    if (url === null) {
      console.warn('Unable to reach the page: ' + name);
      return null;
    }

    url = url.replace(/<lang>/g, this.__opt.lang);
    return url;
  };

  QryCtx.prototype.cachingPolicy = function(level) 
  {
    if (level > this.__caching) {
      this.__caching = level;
    }
  };

  // Get the value of a variable
  QryCtx.prototype.varGet = function(name) 
  {
    var mt = null;
    if (mt = name.match(/^query\.(.*)/)) {
      this.cachingPolicy(CachingPolicy.QUERY);
      return this.__data.query[mt[1]];

    } else if (mt = name.match(/^session\.(.*)/)) {
      this.cachingPolicy(CachingPolicy.SESSION);
      return this.__data.session[mt[1]];
      
    }

    return this.__data.data[name];
  };

  // Assign a variable
  QryCtx.prototype.varSet = function(name, value) 
  {
    var mt = null;
    if (name.match(/^query\./) || name.match(/^system\./)) {
      throw new Error("Variable " + name + " is read only");

    } else if (mt = name.match(/^session\.(.*)/)) {
      this.sessionUpdate = true;
      this.__data.session[mt[1]] = value;

    } else {
      this.__data.data[name] = value;
    }

    return value;
  };

  QryCtx.prototype.evaluate = function (expression)
  {
    return QryCtx.dummyTextEval(expression, this);
  };

  QryCtx.dummyTextEval = function (value, ctx)
  {
    // console.log ('EVALUATE', value)
    var operatorArray = [ '+', '-z', '-n', '-eq', '-ne', '=', '!=' ];


    var splitInToken = function (data) {
      var tokens = [];
      var lg = 0;

      var extractLitteral = function(data, chr) {
        var str = '';
        while (data[++lg] !== chr && lg < data.length) {
          if (data[lg] === '\\') { ++lg; }
          str += data[lg];
        }
        ++lg;
        // console.log('__extract', str);
        return str;
      };

      while (lg < value.length) {
        if (data[lg] == '\'') {
          tokens.push (extractLitteral(data, '\''));
        } else if (data[lg] == '"') {
          tokens.push (extractLitteral(data, '"'));
        } else {
          var str = '';
          while (data[lg] !== ' ' && lg < data.length) {
            str += data[lg++];
          }
   
          // console.log('__extract', str);
          var stre = arrayIncludes(operatorArray, str) ? str : ctx.varGet(str);
          if (!stre) {
            console.warn ('The variable \'' + str + '\' is undefined');
          }

          tokens.push (!!stre ? stre : '');
        }
        
        lg++;
      }

      return tokens;
    };

    var collapseString = function (tokens) {
      var str = '';
      for  (var i =0; i<tokens.length; ++i) {
        if (i+1 < tokens.length) {
          switch(tokens[i]) {
            case '+':
              str += tokens[++i];
              break;
            case '-z':
              str = (tokens[++i] === '' ? true : false);
              break;
            case '-n':
              str = (tokens[++i] !== '' ? true : false);
              break;
            case '=':
            case '-eq':
              str = (tokens[++i] === str ? true : false);
              break;
            case '!=':
            case '-ne':
              str = (tokens[++i] !== str ? true : false);
              break;
            default:
              str += tokens[i];
              break;
          }
        } else {
          str += tokens[i];
        }
      }

      return str;
    };

    // console.log ('token', tokens.toString())
    
    var tokens = splitInToken (value);
    // console.log ('EVALUATE 1', tokens)
    if (tokens.length === 1) {
      return tokens[0];

    } else {
     return collapseString(tokens);
    }
  };

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
//      M A R K U P    C O M M A N D S
// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=

  var MarkupCommands = {};

  MarkupCommands.extends = function (mark, ctx) 
  {
    if (mark.value.length !== 1) {
      console.error('The command \'extends\' take one argument');
    }
    ctx.__parent = ctx.evaluate (mark.value[0]);
  };

  MarkupCommands.set = function (mark, ctx, callback) 
  {
    if (mark.value.length !== 2) {
      return callback('The command \'set\' take two arguments');
    }

    try {
      ctx.varSet(mark.value[0], ctx.evaluate (mark.value[1]));
    } catch (ex) {
      return callback(ex);
    }
    callback();
  };

  MarkupCommands.get = function (mark, ctx, callback) 
  {
    if (mark.value.length !== 1) {
      return callback('The command \'get\' take one argument');
    }

    mark.data = ctx.evaluate (mark.value[0]);
    callback();
  };

  MarkupCommands.get_if = function (mark, ctx, callback) 
  {
    if (mark.value.length !== 3) {
      return callback('The command \'get_if\' take three arguments');
    }
    
    var cdt = ctx.evaluate (mark.value[0]);
    var v = (cdt !== '' && cdt !== false) ? 1 : 2;
    mark.data = ctx.evaluate (mark.value[v]);
    callback();
  };

  MarkupCommands.doLayout = function (mark, ctx, callback) 
  {
    if (mark.value.length !== 1) {
      return callback ('The command \'doLayout\' take one argument');
    } else {
      mark.data = ctx.__modelData;
      callback();
    }
  };

  MarkupCommands.include = function (mark, ctx, callback) 
  {
    if (mark.value.length !== 1) {
      return callback ('The command \'include\' take one argument');
    } else {
      var url = ctx.evaluate(mark.value[0]);
      url = ctx.getUrl(url);
      FastApp.buildFile (url, ctx, function (err, data) {
        if (err) { return callback(err); }
        mark.data = data;
        callback();
      });
    }
  };

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

  FastApp.parseCookies = function(req, res, next) 
  {
    if (!req.cookie) {
      var cookie = req.headers.cookie.split(';');
      req.cookie = {};
      for (var k in cookie) {
        var n = cookie[k].indexOf('=');
        if (n < 0) {
          req.cookie[cookie[k]] = true;
        } else {
          var key = cookie[k].substring(0, n);
          var value = cookie[k].substring(n+1);
          req.cookie[key] = value;
        }
      }
    }

    if (next) {
      next(); // To used with express!
    }
  };


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
      if (commands.length == 0) {
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
          if (err) return callback(err);
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

    if (ctx.__parent == null) {
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

// ==========================================================================
  FastApp.noConflict = function () 
  {
    root.FastApp = previous_mod;
    return FastApp;
  };

  if (module && typeof module !== 'undefined' && module.exports) { // Node.js
    module.exports = FastApp;
  } else if (define && typeof define !== 'undefined' && define.amd) { // AMD / RequireJS
    define([], function () { return FastApp; });
  } else { // Browser
    root.FastApp = FastApp;
  }
  
}).call(this);

// ------------------------------------------------------------------------
// ------------------------------------------------------------------------

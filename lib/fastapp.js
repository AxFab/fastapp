/*!
*   FastApp
* Copyright 2014-2015 Fabien Bavent
* Released under the BSD license
*/
(function () {
  var previous_mod, root = this
  if (root != null)
    previous_mod = root.FastApp

  var fs = require('fs'),
      async = require('async');

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
//      P A G E   B U I L D I N G   C O N T E X T
// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=

  var CachingPolicy = {
    STATIC: 0,
    QUERY: 1,
    SESSION: 2,
    VOLATILE: 3,
  }

  var QryCtx = function (req, opt)
  {
    if (!(this instanceof QryCtx))
      return new QryCtx(req, opt);

    if (req == null) {
      req = { 
        query:{},
        cookie: {},
      };
    }

    if (opt == null) {
      opt = {};
    }

    FastApp.parseCookies(req);
    this.reset(req);
    this.__opt = opt;
  }

  QryCtx.prototype.reset = function(req) 
  {
    this.__data = {
      query: req.query,
      session: {},
      data: {},
    }

    this.__caching = CachingPolicy.STATIC
  }

  QryCtx.prototype.getUrl = function (name) 
  {
    if (this.__opt.path) {
      var url = this.__opt.path;
      url = url.replace(/<lang>/g, this.__opt.lang);
      url = url.replace(/<page>/g, name);
      return url;
    }

    if (this.__opt.dir) {
      var url = this.__opt.dir + '/' + name;
      url = url.replace(/<lang>/g, this.__opt.lang);
      return url;
    }

    // console.error (this.__opt)
    return name;
  }

  QryCtx.prototype.cachingPolicy = function(level) 
  {
    if (level > this.__caching)
      this.__caching = level;
  }

  // Get the value of a variable
  QryCtx.prototype.varGet = function(name) 
  {
    var mt = null
    if (mt = name.match(/^query\.(.*)/)) {
      this.cachingPolicy(CachingPolicy.QUERY);
      return this.__data.query[mt[1]];

    } else if (mt = name.match(/^session\.(.*)/)) {
      this.cachingPolicy(CachingPolicy.SESSION);
      return this.__data.session[mt[1]];
      
    }

    return this.__data.data[name];
  }

  // Assign a variable
  QryCtx.prototype.varSet = function(name, value) 
  {
    var mt = null
    if (name.match(/^query\./) || name.match(/^system\./)) {
      throw new Error("Variable " + name + " is read only");

    } else if (mt = name.match(/^session\.(.*)/)) {
      this.sessionUpdate = true;
      return this.__data.session[mt[1]] = value;
    }

    return this.__data.data[name] = value;
  }

  QryCtx.prototype.eval = function (expression)
  {
    return QryCtx.dummyTextEval(expression, this);
  }

  QryCtx.dummyTextEval = function (value, ctx)
    {
      var tokens = [];
      var str = '';
      var stre = '';
      var lg = 0;
      while (lg < value.length) {
        if (value[lg] == '\'') {
          while (value[++lg] != '\'' && lg < value.length) {
            if (value[lg] == '\\')
              ++lg;
            str += value[lg];
          }
          tokens.push (str);
          str = '';
        } else if (value[lg] == '"') {
          while (value[++lg] != '"' && lg < value.length) {
            if (value[lg] == '\\')
              ++lg;
            str += value[lg];
          }
          tokens.push (str);
          str = '';
        } else {
          while (value[lg] != ' ' && lg < value.length)
            str += value[lg++];
          if (str != '+' && str != '-z' && str != '-n' && str != '-eq' && str != '-ne' && str != '=' && str != '!=') // TODO contains in list of operator !!
            stre = ctx.varGet(str);
          else stre = str
          if (stre == null) {
            console.warn ('The variable \'' + str + '\' is undefined');
          }
          tokens.push (stre != null ? stre : '');
          str = '';
        }
        
        lg++;
      }
      // console.log ('token', tokens.toString())
      
      if (tokens.length == 1)
        return tokens[0];
      else {
        str = ''
        for  (var i =0; i<tokens.length; ++i) {
          switch(tokens[i]) {
            case '+':
              if (i+1 < tokens.length)
                str += tokens[++i];
              break;
            case '-z':
              if (i+1 < tokens.length)
                str = (tokens[++i] == '' ? true : false);
              break;
            case '-n':
              if (i+1 < tokens.length)
                str = (tokens[++i] != '' ? true : false);
              break;
            case '=':
            case '-eq':
              if (i+1 < tokens.length)
                str = (tokens[++i] == str ? true : false);
              break;
            case '!=':
            case '-ne':
              if (i+1 < tokens.length)
                str = (tokens[++i] != str ? true : false);
              break;
            default:
              str += tokens[i];
              break;
          }
        }
       return str;
      }
    }

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
//      M A R K U P    C O M M A N D S
// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=

  var MarkupCommands = {}

  MarkupCommands.extends = function (mark, ctx) 
  {
    if (mark.value.length != 1) {
      console.error('The command \'extends\' take one argument');
    }
    ctx.__parent = ctx.eval (mark.value[0]);
  };

  MarkupCommands.set = function (mark, ctx, callback) 
  {
    if (mark.value.length != 2) {
      return callback('The command \'set\' take two arguments');
    }
    try {
    ctx.varSet(mark.value[0], ctx.eval (mark.value[1]))
    } catch (ex) {
      return callback(ex);
    }
    callback();
  };

  MarkupCommands.get = function (mark, ctx, callback) 
  {
    if (mark.value.length != 1) {
      return callback('The command \'get\' take one argument');
    }

    mark.data = ctx.eval (mark.value[0]);
    callback()
  };

  MarkupCommands.get_if = function (mark, ctx, callback) 
  {
    if (mark.value.length != 3) {
      return callback('The command \'get_if\' take three arguments');
    }
    
    var cdt = ctx.eval (mark.value[0]);
    var v = (cdt != '' && cdt != false) ? 1 : 2
    mark.data = ctx.eval (mark.value[v]);
    callback()
  };

  MarkupCommands.doLayout = function (mark, ctx, callback) 
  {
    if (mark.value.length != 1) {
      return callback ('The command \'doLayout\' take one argument');
    } else {
      mark.data = ctx.__modelData
      callback();
    }
  };

  MarkupCommands.include = function (mark, ctx, callback) 
  {
    if (mark.value.length != 1) {
      callback ('The command \'include\' take one argument');
      return null;
    } else {
      var url = ctx.eval(mark.value[0]);
      url = ctx.getUrl(url);
      FastApp.buildFile (url, ctx, function (err, data) {
        if (err) return callback(err);
        mark.data = data
        callback();
      })
    }
  };

// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=
//      P A G E   E N G I N E
// -=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=

  var FastApp = function () 
  {
  }

  FastApp.QryCtx = QryCtx;

  FastApp.tracing = function (req, res, next)
  {
    res._startAt = new Date().getTime()
    res.on('finish', function () {
      res._endAt = new Date().getTime()
      res.elapsed = res._endAt - res._startAt
      console.log(res.statusCode + ' ' + req.method + ' ' + req.path + ' ' + res.elapsed + 'ms')
    })

    if (next)
      next();
  };

  FastApp.parseCookies = function(req, res, next) 
  {
    if (!req.cookie) {
      var cookie = req.headers.cookie.split(';')
      req.cookie = {}
      for (var k in cookie) {
        var n = cookie[k].indexOf('=')
        if (n < 0) {
          req.cookie[cookie[k]] = true
        } else {
          var key = cookie[k].substring(0, n)
          var value = cookie[k].substring(n+1)
          req.cookie[key] = value
        }
      }
    }

    if (next) next() // To used with express!
  };


  FastApp.searchInfo = function(req, res, next) 
  {
    req.opt = {
      lang: 'fr'
    }

    var langs = req.headers['accept-language'].split(',')
    // console.log ('LANGUAGE', langs[0].substring(0, 2))
    langs.forEach(function () {
      console.log ('Lg', arguments)
    })

    if (next)
      next()
  };


  FastApp.parseMarkup = function(mark) 
  {
    var tag = mark.substring(2);
    var c = '';
    
    while (tag[0] <= ' ')
      tag = tag.substring(1);

    while (tag[0] > ' ') {
      c += tag.substring(0, 1);
      tag = tag.substring(1);
    }
    
    if (c == '/}') {
      console.warn('Empty tag')
      return '';
    }
    
    var command = c;
    var args = [];
    c = '';
    for (;;) {
      while (tag[0] <= ' ')
        tag = tag.substring(1);

      while (tag[0] != ':' && (tag[0] != '/' || tag[1] != '}')) { 
        c += tag.substring(0, 1);
        tag = tag.substring(1);
      }
      
      if (c == '/}' || c == '}') {
        console.log('Cmd: '+ args);
        return;
      }
      
      c = c.trim();
      args.push(c);
      c = '';
      
      if (tag[0] == '/' && tag[1] == '}')
        return {type:command, value:args };
      tag = tag.substring(1);
    }
  };

  FastApp.buildFile = function (path, ctx, callback)
  {
    if (!ctx) ctx = new QryCtx();

    // console.log ('-->', path)
    fs.readFile(path, function (err, data) {
      if (err) return callback(err);

      data = data.toString();
      var contentArray = [];
      var template = null;
      var commands = []

      for(;;) {
        // Search for a markup command
        var l = data.match(/#\{.*\/\}/)
        if (l == null) break;
        if (l.index > 0)
          contentArray.push(data.substring(0, l.index))
        data = data.substring (l.index + l[0].length)

        // Parse command
        var cmd = FastApp.parseMarkup(l[0])
        contentArray.push(cmd);
        if (cmd.type != 'extends')
          commands.push(cmd)
        else
          template = cmd
      }

      // Push the rest of the file
      contentArray.push(data);

      // Regroup page parts
      if (commands.length == 0) {
        if (template)
          MarkupCommands.extends(template, ctx)
        FastApp.regroup(contentArray, ctx, callback)
      } else {
        // Launch all commands
        // console.log('Launch all commands', path);
        async.each(commands, function (cmd, cb) {
          if (!MarkupCommands[cmd.type])
            return cb(new Error('Command '+cmd.type+' doesn\'t exist.'))
          MarkupCommands[cmd.type](cmd, ctx, cb);
        }, function (err) {
          // console.log('Finished all commands', path);
          if (err) return callback(err);
          if (template)
            MarkupCommands.extends(template, ctx)
          FastApp.regroup(contentArray, ctx, callback)
        })
      }
    })
  };

  FastApp.regroup = function (array, ctx, callback)
  {
    var data = ''
    for (var i=0; i < array.length; ++i) {
      if (typeof array[i] === 'string')
        data += array[i]
      else if (array[i].data != null)
        data += array[i].data
    }

    if (ctx.__parent == null) {
      callback (null, data)
    } else {
      ctx.__modelData = data;
      var url = ctx.getUrl(ctx.__parent);
      ctx.__parent = null;
      FastApp.buildFile(url, ctx, callback)
    }
  };


  FastApp.respondPage = function (res, url, ctx, opt)
  {
    FastApp.buildFile(url, ctx, function (err, data) {
      var headers = {};
      if (err) {
        // res.writeHead(500, headers);
        return res.send(''); // TODO Handle 404 / 403 / 500 ...
      }

      // TODO -- deflate if accepted!
      headers['content-length'] = data.length;
      headers['content-type'] = 'text/html';
      // res.writeHead(200, headers)
      res.send(data);
    });
  }

  FastApp.listenAt = function (directory, opt)
  {
    return function (req, res) {
      var page = req.url;
      var ctx = new QryCtx(req, { dir:directory, lang:req.opt.lang });
      var url = ctx.getUrl(page);
      FastApp.respondPage(res, url, ctx);
    }
  }

  FastApp.listenDir = function (path, param, opt)
  {
    return function (req, res) {
      var page = req.params[param];
      var ctx = new QryCtx(req, { path:path, lang:req.opt.lang });
      var url = ctx.getUrl(page);
      FastApp.respondPage(res, url, ctx);
    }
  };

// ==========================================================================
  FastApp.noConflict = function () 
  {
    root.FastApp = previous_mod
    return FastApp
  }

  if (typeof module !== 'undefined' && module.exports) // Node.js
    module.exports = FastApp
  else if (typeof define !== 'undefined' && define.amd) // AMD / RequireJS
    define([], function () { return FastApp })
  else // Browser
    root.FastApp = FastApp
  
}).call(this)

// ------------------------------------------------------------------------
// ------------------------------------------------------------------------

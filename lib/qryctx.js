/*
*   FastApp
* Copyright 2014-2015 Fabien Bavent
* Released under the BSD 3-Clause license
*/
(function () {
  var previous_mod, root = this;
  if (root !== null) {
    previous_mod = root.QryCtx;
  }

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

    QryCtx.parseCookies(req);
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
    mt = name.match(/^query\.(.*)/);
    if (mt) {
      this.cachingPolicy(CachingPolicy.QUERY);
      return this.__data.query[mt[1]];
    } 

    mt = name.match(/^session\.(.*)/);
    if (mt) {
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
    } 

    mt = name.match(/^session\.(.*)/);
    if (mt) {
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

  QryCtx.parseCookies = function(req, res, next) 
  {
    if (!req.cookie) {
      var cookie = req.headers.cookie.split(';');
      req.cookie = {};
      for (var k in cookie) {
        if (typeof cookie[k] === 'string') {
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
    }

    if (next) {
      next(); // To used with express!
    }
  };

  QryCtx.dummyTextEval = function (value, ctx)
  {
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
        return str;
      };

      while (lg < value.length) {
        if (data[lg] === '\'') {
          tokens.push (extractLitteral(data, '\''));
        } else if (data[lg] === '"') {
          tokens.push (extractLitteral(data, '"'));
        } else {
          var str = '';
          while (data[lg] !== ' ' && lg < data.length) {
            str += data[lg++];
          }
   
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
      var i;
      var str = '';
      var ops = {
        '+': function() { str += tokens[++i]; },
        '-z': function() { str = (tokens[++i] === '' ? true : false); },
        '-n': function() { str = (tokens[++i] !== '' ? true : false); },
        '-eq': function() { str = (tokens[++i] === str ? true : false); },
        '-ne': function() { str = (tokens[++i] !== str ? true : false); },
      };
      ops['='] = ops['-eq'];
      ops['!='] = ops['-ne'];

      for  (i = 0; i<tokens.length; ++i) {
        if (i+1 < tokens.length && ops[tokens[i]]) {
          ops[tokens[i]] ();
        } else {
          str += tokens[i];
        }
      }

      return str;
    };
    
    var tokens = splitInToken (value);
    if (tokens.length === 1) {
      return tokens[0];

    } else {
     return collapseString(tokens);
    }
  };


// ==========================================================================
  QryCtx.noConflict = function () 
  {
    root.QryCtx = previous_mod;
    return QryCtx;
  };

  if (typeof module !== 'undefined' && module.exports) { // Node.js
    module.exports = QryCtx;
  } else { // Browser
    root.QryCtx = QryCtx;
  }
  
}).call(this);

// ------------------------------------------------------------------------
// ------------------------------------------------------------------------

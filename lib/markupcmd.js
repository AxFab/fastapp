/*
*   FastApp
* Copyright 2014-2015 Fabien Bavent
* Released under the BSD 3-Clause license
*/
(function () {
  var previous_mod, root = this;
  if (root !== null) {
    previous_mod = root.MarkupCommands;
  }

  var fs = require('fs'),
      async = require('async');

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
      MarkupCommands.buildFile (url, ctx, function (err, data) {
        if (err) { return callback(err); }
        mark.data = data;
        callback();
      });
    }
  };


// ==========================================================================
  MarkupCommands.noConflict = function () 
  {
    root.MarkupCommands = previous_mod;
    return MarkupCommands;
  };

  if (typeof module !== 'undefined' && module.exports) { // Node.js
    module.exports = MarkupCommands;
  } else if (typeof define !== 'undefined' && define.amd) { // AMD / RequireJS
    define([], function () { return MarkupCommands; });
  } else { // Browser
    root.MarkupCommands = MarkupCommands;
  }
  
}).call(this);

// ------------------------------------------------------------------------
// ------------------------------------------------------------------------

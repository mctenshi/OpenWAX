/*jshint node: true */
"use strict";

var step = require('step');
var express = require('express');
var app = express();
var locale = require("locale");
var I18n = require('i18n-2');
var db = require('mongoose');
require('./lib/func.js');
require('./lib/models')(db, db.Schema);
db.connect('mongodb://localhost/openwax');


var main = function (req, res, next) {
  var Score = db.model('Score');

  step(
    function readRecentScores() {
      Score.find().sort('-updated_at').limit(5).exec(this);
    },
    function render(err, scores) {
      if (err) {
        next(err);
        return;
      }

      res.render('main', {
        title: '',
        scores: scores
      });
    }
  );
};

var log = function (req, res, next) {
  var Score = db.model('Score');

  var url = req.param('url');
  var score = parseInt(req.param('score'), 10);
  var title = req.param('title');

  // do nothing on protocol other than http and https
  if (url.indexOf('http://') === -1 &&
      url.indexOf('https://') === -1) {
    next();
    return;
  }

  // do nothing if domain is 127.0.0.1 or localhost or custom host(url do not have dot)
  if (url.indexOf('://127.0.0.1') > -1 ||
      url.indexOf('://localhost') > -1 ||
      /^https?:\/\/[a-zA-Z0-9:]+\//.test(url)) {
    next();
    return;
  }

  step(
    function readOldData() {
      Score.findOne({url: url}, this);
    },
    function createOrUpdateData(err, data) {
      if (err) {
        next(err);
        return;
      }

      if (data) {
        data.times++;
        data.save(this);
      } else {
        data = new Score();
        data.url = url;
        data.times = 1;
      }
      data.title = title;
      data.score = score;
      data.updated_at = new Date();
      data.save(this);
    },
    function finalize(err) {
      if (err) {
        next(err);
        return;
      }

      next();
    }
  );
};

var render1x1Gif = function (req, res) {
  var imgHex = '47494638396101000100800000dbdfef00000021f90401000000002c00000000010001000002024401003b';
  var imgBuffer = new Buffer(imgHex, 'hex');
  res.setHeader('Content-Type', 'image/gif');
  res.end(imgBuffer, 'binary');
};

var search = function (req, res, next) {
  var Score = db.model('Score');
  var q = req.param('q').replace(/^https?:\/\//i, '');
  var validQExp = /^([a-z0-9]+\.)+[a-z]{2,3}$/i;
  if (!validQExp.test(q)) {
    q = "";
  }

  step(
    function getScoresFromQ() {
      if (q) {
        Score.find({'url': new RegExp(q)}).sort('-updated_at').exec(this);
      } else {
        this(null, []);
      }
    },
    function calcSumAndAvg(e, list) {
      var sum = 0,
        avg = 0,
        i, l = list.length;

      if (e) {
        next(e);
        return;
      }

      for (i = 0; i < l; i++) {
        sum += list[i].score;
      }

      avg = l === 0 ? 0 : parseInt(sum / l * 10, 10) / 10;

      this(list, sum, avg);
    },
    function render(list, sum, avg) {
      res.render('search', {
        title: req.i18n.__('Search'),
        q: q,
        count: list.length,
        list: list,
        avg: avg
      });
    }
  );
};

app.configure(function () {
  // see i18n-2-5.patch. Should be applied until
  // https://github.com/jeresig/i18n-node-2/pull/5
  // get merged or resolved
  /*
  app.use(function register_i18n(req, res, next) {
    req.i18n = i18n;
    I18n.registerMethods(res.locals, req);
    i18n.setLocaleFromQuery(req);
    i18n.prefLocale = i18n.preferredLocale();
    next();
  });
  */
  I18n.expressBind(app, {
    locales: ['en', 'ko'],
    directory: __dirname + "/locales"
  });

  app.use(express.bodyParser());
  app.use(express.static(__dirname + '/public'));
  app.use(function (req, res, next) {
    var supported = new locale.Locales(['en', 'ko']);
    var locales = new locale.Locales(req.headers["accept-language"]);
    var best = locales.best(supported);
    req.i18n.setLocale(best ? best.language : 'en');
    next();
  });
  app.use(app.router);
  app.set('view engine', 'html');
  app.set('views', __dirname + '/views');
  app.engine('html', require('ejs-locals'));
});

app.get('/', main);
app.get('/log', log, render1x1Gif);
app.get('/search', search);

app.listen((process.argv && process.argv[2] && parseInt(process.argv[2], 10)) || 8117);

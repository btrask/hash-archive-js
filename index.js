#!/usr/bin/env node
// Copyright 2016 Ben Trask
// MIT licensed (see LICENSE for details)

var cluster = require("cluster");
var crypto = require("crypto");
var fs = require("fs");
var http = require("http");
var https = require("https");
var qs = require("querystring");
var urlm = require("url");
var pathm = require("path");
var util = require("util");
var streamm = require("stream");
var WARCStream = require('warc');

var mime_table = require("./mime.json");
//var robots = require("robots");
var sqlite = require("sqlite3").verbose();

var has = require("./has");
var hashm = require("./hash");
var templates = require("./templates");
var errno = require("./errno");
var db_pool = require("./db_pool");
var work_queue = require("./work_queue");

var config = require("./config_obj");


var DB_POOL_SIZE = 16;
var db_open = db_pool.open;
var db_close = db_pool.close;


var recent_urls = [];
function recent_urls_update() {
	db_open(function(db) {
		db.all(
			"SELECT DISTINCT req.url\n"+
			"FROM responses AS res\n"+
			"INNER JOIN requests AS req ON (res.request_id = req.request_id)\n"+
			"WHERE res.status = 200\n"+
			"ORDER BY res.response_time DESC LIMIT 10",
		function(err, rows) {
			db_close(db);
			if(err) throw err;
			recent_urls = rows.map(function(row) {
				return row.url;
			});
		});
	});
}



function stream_text(stream, cb) {
	var parts = [];
	stream.setEncoding("utf8");
	stream.on("data", function(chunk) {
		parts.push(chunk);
	});
	stream.on("end", function() {
		cb(null, parts.join(""));
	});
	stream.on("error", function(err) {
		cb(err, null);
	});
}

var WORKERS_MAX = 10;
var workers = 0;
function workers_start() {
	for(var i = 0; i < WORKERS_MAX; i++) worker();
}

if(!cluster.isMaster) {
	var assigned_work = [];
	process.on("message", function(msg) {
		switch(msg.cmd) {
		case "work": assigned_work.push(msg.req); worker(); return;
		}
	});
}
function request_load_one(cb) {
	if(cluster.isMaster) {
		work_queue.get(cb);
	} else {
		process.nextTick(function() {
			if(!assigned_work.length) {
				process.send({ cmd: "send_work" });
				return cb(null, null);
			}
			cb(null, assigned_work.shift());
		});
	}
}
function worker() {
	if(workers >= WORKERS_MAX) return;
	workers++;
	request_load_one(function(err, req) {
		if(err) throw err;
		if(!req) {
			workers--;
			console.log("Worker stopping (remaining: "+workers+")");
			return;
		}
		function check_err(db, err) {
			if(err) {
				db_close(db);
				throw err;
			}
		}
		function finish_transaction(db) {
			db.run("COMMIT", function(err) {
				check_err(db, err);
				db_close(db);
				var elapsed = +new Date - start_time;
				var delay = config["crawl_delay"];
				setTimeout(function() {
					workers--;
					worker();
				}, Math.max(0, delay - elapsed));
			});
		}

		var start_time = +new Date;
		url_check_and_stat(req.url, 0, function(err, res) {
			if(err) res = request_error(req, err);
			if (res.processed) return;
			res.processed = true;

			db_open(function(db) {
				db.run("BEGIN TRANSACTION", function(err) {
					check_err(db, err);
					response_store(db, req, res.main, function(err, response_id) {
						check_err(db, err);
						console.log(res);
						if (res.inners) {
							inners_store(db, res.inners, response_id, function(err) {
								check_err(db, err);
								finish_transaction(db);
							});
						} else {
							finish_transaction(db);
						}
					});
				});
			});
		});
	});
}
function request_error(req, err) {
	if("ENOTFOUND" === err.errno) err.errno = errno.ERR_NOTFOUND; // Node bug
	if("ECONNREFUSED" === err.errno) err.errno = errno.ERR_CONNREFUSED;
	if("string" === typeof err.errno) {
		console.log("Unknown error code "+err.errno);
		err.errno = errno.ERR_UNKNOWN;
	}
	return { status: err.errno, response_time: +new Date, hashes: {} };
}


function url_check_robots_txt(obj, cb) {
	// This crawl was requested by a 100% natural human being!
	return cb(null);
/*	var protocol = "https:" === obj.protocol ? https : http;
	var req = protocol.request({
		method: "GET",
		hostname: obj.hostname,
		port: obj.port,
		path: "/robots.txt",
		headers: {
			"User-Agent": config["user_agent"],
		},
	});
	req.end();
	req.on("response", function(res) {
		if(200 != res.statusCode) return cb(null);
		stream_text(res, function(err, txt) {
			if(err) return cb(err);
			var parser = new robots.RobotsParser();
			parser.parse(txt.split("\n"));
			var fetchable = parser.canFetchSync(config["user_agent"], obj.path);
			if(fetchable) return cb(null);
			err = new Error("Blocked by robots.txt");
			err.errno = errno.ERR_BLOCKED;
			cb(err);
		});
	});
	req.on("error", function(err) {
		cb(err);
	});*/
}
function url_stat(obj, redirect_count, cb) {
	var protocol = "https:" === obj.protocol ? https : http;
	var req = protocol.request({
		method: "GET", // TODO: HEAD first?
		hostname: obj.hostname,
		port: obj.port,
		path: obj.path,
		agent: false,
		headers: {
			"User-Agent": config["user_agent"],
			// TODO: if-modified and if-not-match
		},
	});
	req.end();

	function url_response(res) {
		if(is_redirect(res)) {
			return url_check_and_stat(res.headers["location"], redirect_count+1, cb);
		}

		var w = null;
		var full_response = {};
		if (/\.warc$/.test(obj.path.toLowerCase())) {
			console.log('warc!!!');
			full_response.inners = [];
			w = new WARCStream();
			res.pipe(w)
			w.on('data', function (data) {
				if (data.headers['WARC-Type'] !== 'response') return;

				console.log(data.headers['WARC-Target-URI']);
				data_stream = streamm.PassThrough();
				data_stream.end(data.content);
				do_hashing({
					status: '200',
					content_type: '?',
					etag: '?',
					last_modified: '?',
					date: data.headers['WARC-Date'],
					data: data_stream
				}, function(err, res_thing) {
					full_response.inners.push(
						{
							request_url: data.headers['WARC-Target-URI'],
							response: res_thing
						});
				});
			});
			w.on('end', function() {
				console.log('Finished WARC processing');
				full_response.done = true;
				if (full_response.main) {
					cb(null, full_response);
				}
			});
		} else {
			full_response.done = true;
		}
		do_hashing({
			status: res.statusCode,
			content_type: res.headers["content-type"],
			etag: res.headers["etag"],
			last_modified: res.headers["last-modified"],
			date: res.headers["date"],
			data: res
		}, function (err, res_thing) {
			if(err) return cb(err, null);
			console.log('Finished normal processing');
			full_response.main = res_thing;
			if (full_response.done) {
				cb(null, full_response);
			}
		});
		res.on("error", function(err) {
			cb(err, null);
		});
	}

	req.on("response", url_response);
	req.on("error", function(err) {
		cb(err, null);
	});
}

function is_redirect(res) {
	return res.statusCode >= 300 &&
		res.statusCode <  400 &&
		has(res.headers, "location");
}

function do_hashing(thing, cb) {
	var hashers = {
		"md5": crypto.createHash("md5"),
		"sha1": crypto.createHash("sha1"),
		"sha256": crypto.createHash("sha256"),
		"sha384": crypto.createHash("sha384"),
		"sha512": crypto.createHash("sha512"),
	};
	thing.hashes = {};
	Object.keys(hashers).forEach(function(algo) {
		thing.data.pipe(hashers[algo]);
	});
	thing.data.on("end", function() {
		Object.keys(hashers).forEach(function(algo) {
			hashers[algo].end();
			thing.hashes[algo] = hashers[algo].read();
		});
		thing.response_time = +new Date;
		thing.data = null;
		cb(null, thing);
	});
}

function url_check_and_stat(url, redirect_count, cb) {
	if(redirect_count >= 5) {
		var err = new Error("Too many redirects");
		err.errno = errno.ERR_REDIRECT;
		return cb(err, null);
	}
	var obj = urlm.parse(url);
	url_check_robots_txt(obj, function(err, fetchable) {
		if(err) return cb(err, null);
		url_stat(obj, redirect_count, cb);
	});
}

function url_normalize(url) {
	if("string" !== typeof url) return null;
	// TODO: Fix http:/// and http:/ ?
	var obj = urlm.parse(url);
	if("http:" !== obj.protocol && "https:" !== obj.protocol) return null;
	if(!obj.hostname) return null;
	return urlm.format({
		protocol: obj.protocol.toLowerCase(),
		slashes: null,
		auth: null,
		hostname: obj.hostname.toLowerCase(),
		port: obj.port,
		pathname: obj.pathname || "/",
		search: obj.search,
		hash: null,
	});
}

function dict_2d_rotate(obj) {
	var out = {};
	Object.keys(obj).forEach(function(d1) {
		Object.keys(obj[d1]).forEach(function(d2) {
			if(!has(out, d2)) out[d2] = {};
			out[d2][d1] = obj[d1][d2];
		});
	});
	return out;
}




function request_bump(db, url, cb) {
	// TODO: BEGIN FOR UPDATE or something like that?
	db.run("BEGIN TRANSACTION", function(err) {
		db.get(
			"SELECT req.request_id, res.response_time\n"+
			"FROM requests AS req\n"+
			"LEFT JOIN responses AS res\n"+
			"\t"+"ON (req.request_id = res.request_id)\n"+
			"WHERE req.url = ?\n"+
			"ORDER BY req.request_id DESC LIMIT 1",
			url,
		function(err, row) {
			if(err) return cb(err, null);
			var pending, outdated;
			if(!row) {
				pending = false;
				outdated = true;
			} else if(!row.response_time) {
				pending = true;
				outdated = true;
			} else if(row.response_time < +new Date - (1000*60*60*24)) {
				pending = false;
				outdated = true;
			} else {
				pending = false;
				outdated = false;
			}
			if(outdated && !pending) {
				insert_request(db, url,	function(err) {
					if(err) return cb(err, null);
					db.run("COMMIT", function(err) {
						if(err) return cb(err, null);
						if(cluster.isMaster) {
							worker(); // TODO: HACK
						} else {
							process.send({ cmd: "add_work" });
						}
						cb(null, { outdated: true });
					});
				});
			} else {
				db.run("ROLLBACK", function(err) {
					if(err) return cb(err, null);
					cb(null, { outdated: outdated });
				});
			}
		});
	});
}
function insert_request(db, url, cb) {
	db.run(
		"INSERT INTO requests (url, request_time)\n"+
			"VALUES (?, ?)",
		url, +new Date, cb);
}
function response_store(db, req, res, cb) {
	db.run(
		"INSERT INTO responses (request_id, status, response_time,\n"+
			"\t"+"content_type, etag, last_modified, date)\n"+
			"VALUES (?, ?, ?, ?, ?, ?, ?)",
		req.request_id, res.status, res.response_time,
		res.content_type, res.etag, res.last_modified, res.date,
		function(err) {
			if(err) return cb(err, null);
			var response_id = this.lastID;
			response_store_hashes(db, response_id, res.hashes, cb);
		});
}
function response_store_hashes(db, response_id, hashes, cb) {
	var algos = Object.keys(hashes);
	var i = 0;
	(function next() {
		if(i >= algos.length) return cb(null, response_id);
		var algo = algos[i];
		var data = hashes[algo];
		db.run(
			"INSERT OR IGNORE INTO hashes (algo, data)\n"+
			"VALUES (?, ?)", algo, data,
		function(err) {
			if(err) return cb(err, null);
			db.get(
				"SELECT hash_id FROM hashes\n"+
				"WHERE algo = ? AND data = ? LIMIT 1",
				algo, data,
			function(err, insertion) {
				if(err) return cb(err, null);
				db.run(
					"INSERT INTO response_hashes (response_id, hash_id)\n"+
					"VALUES (?, ?)", response_id, insertion.hash_id,
				function(err) {
					if(err) return cb(err, null);
					i++;
					next();
				});
			});
		});
	})();
}
function inners_store(db, inners, wrapper_response_id, cb) {
	var i = 0;
	(function next() {
		if(i >= inners.length) return cb(null);
		var inner_url = inners[i].request_url;
		var inner_res = inners[i].response;
		insert_request(db, inner_url, function(err) {
			if (err) return cb(err);
			var inner_req = {request_id: this.lastID};
			response_store(
				db, inner_req, inner_res,
				function(err, inner_response_id) {
					if (err) return cb(err);
					db.run(
						"INSERT INTO wrapped_inner_requests (wrapper_response_id, inner_request_id)\n"+
							" VALUES (?, ?)", wrapper_response_id, inner_req.request_id,
						function(err) {
							if (err) return cb(err);
							i++;
							next();
					});
				});
		});
	})();
}
function responses_load(db, url, cb) {
	db.all(
		"SELECT res.response_id, res.status, res.response_time,\n"+
		"\t"+"res.content_type, res.etag, res.last_modified, res.date\n"+
		"FROM requests AS req\n"+
		"INNER JOIN responses AS res ON (req.request_id = res.request_id)\n"+
		"WHERE req.url = ?\n"+
		"ORDER BY res.response_id DESC LIMIT 30",
		url,
	function(err, responses) {
		if(err) return cb(err, null);
		var i = 0;
		(function next() {
			if(i >= responses.length) return cb(null, responses);
			db.all(
				"SELECT h.algo, h.data\n"+
				"FROM response_hashes AS r\n"+
				"INNER JOIN hashes AS h ON (r.hash_id = h.hash_id)\n"+
				"WHERE r.response_id = ?",
				responses[i].response_id,
			function(err, hashes) {
				if(err) return cb(err, null);
				var obj = {};
				for(var j = 0; j < hashes.length; j++) {
					obj[hashes[j].algo] = hashes[j].data;
				}
				responses[i].hashes = obj;
				i++;
				next();
			});
		})();
	});
}














function POST_lookup(req, res) {
	if(req.method != "POST") return -1;
	if(req.url != "/lookup") return -1;
	var len = parseInt(req.headers["content-length"], 10);
	if(isNaN(len) || len > 1000) return 403;

	stream_text(req, function(err, string) {
		if(err) return http_error(req, res, 400);
		var query = qs.parse(string);
		if(!has(query, "str")) return http_error(req, res, 400);
		var str = query["str"].trim();
		if("" === str) {
			res.writeHead(303, {
				"Content-Type": "text/plain; charset=utf-8",
				"Location": "/",
			});
			res.end("Redirecting...", "utf8");
			return;
		}
		var url = url_normalize(str);
		var hash = hashm.normalize(str);
		if(url) {
			res.writeHead(303, {
				"Content-Type": "text/plain; charset=utf-8",
				"Location": "/history/"+url,
			});
			res.end("Redirecting...", "utf8");
		} else if(hash) {
			res.writeHead(303, {
				"Content-Type": "text/plain; charset=utf-8",
				"Location": "/sources/"+hash,
			});
			res.end("Redirecting...", "utf8");
		} else {
			res.writeHead(303, {
				"Content-Type": "text/plain; charset=utf-8",
				"Location": "/error.html",
			});
			res.end("Redirecting...", "utf8");
		}
	});
	return 0;
}
function GET_history(req, res) {
	if("GET" != req.method && "HEAD" !== req.method) return -1;
	var match = /^\/history\/(.*)$/.exec(req.url);
	if(!match) return -1;

	var url = url_normalize(match[1]);
	if(!url) return http_error(req, res, 400);

	db_open(function(db) {
	responses_load(db, url, function(err, responses) {
		if(err) {
			db_close(db);
			http_error(req, res, 500);
			throw err;
		}
		request_bump(db, url, function(err, state) {
			db_close(db);
			if(err) {
				http_error(req, res, 500);
				throw err;
			}

			res.writeHead(200, {
				"Content-Type": "text/html; charset=utf-8",
			});
			templates.history(res, url, state.outdated, responses);
		});
	});
	});

	return 0;
}
function GET_sources(req, res) {
	if("GET" !== req.method && "HEAD" !== req.method) return -1;
	var match = /^\/sources\/(.*)$/.exec(req.url);
	if(!match) return -1;

	var hash = match[1];
	var obj = hashm.parse(hash);
	if(!obj) return http_error(req, res, 400);

	// TODO: We should check whether each URL is still "active"
	// or whether the last hash has changed.
	// TODO: Check hash prefix, rather than full hash...
	db_open(function(db) {
	db.all(
		"SELECT req.url, MAX(res.response_time) AS response_time, 1 AS active\n"+
		"FROM hashes AS h\n"+
		"INNER JOIN response_hashes AS rh ON (h.hash_id = rh.hash_id)\n"+
		"INNER JOIN responses AS res ON (rh.response_id = res.response_id)\n"+
		"INNER JOIN requests AS req ON (res.request_id = req.request_id)\n"+
		"WHERE h.algo = ? AND h.data = ?\n"+
		"GROUP BY req.url\n"+
		"ORDER BY response_time DESC LIMIT 30",
		obj.algo, obj.data,
	function(err, rows) {
		db_close(db);
		if(err) {
			console.log(err);
			return http_error(req, res, 500);
		}
		var status = rows.length ? 200 : 404;
		res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
		templates.sources(res, hash, rows);
	});
	});
	return 0;
}
function GET_index(req, res) {
	if("GET" !== req.method && "HEAD" !== req.method) return -1;
	if("/" !== req.url) return -1;

	templates.index(res,
	"http://torrents.linuxmint.com/torrents/linuxmint-17.3-cinnamon-64bit.iso.torrent",
	"hash://sha256/212cc9f731e2237fb1e487eb5056080aeded67223f9c318cd450a30633e5dc62",
	recent_urls);
	return 0;
}




function http_error(req, res, status, msg) {
	res.writeHead(status, msg, { "Content-Type": "text/plain; charset=utf-8" });
	res.end(msg || errno.http_strerror(status), "utf-8");
	return 0;
}
function mime(path) {
	var ext = pathm.extname(path);
	if(!has(mime_table, ext)) return "application/octet-stream"
	var type = mime_table[ext];
	if("text/" == type.slice(0, 5)) type += "; charset=utf-8";
	return type;
}

function listener(req, res) {
	var url = req.url;
//	console.log(url);

	var x = -1;
	x = x >= 0 ? x : GET_index(req, res);
	x = x >= 0 ? x : GET_history(req, res);
	x = x >= 0 ? x : GET_sources(req, res);
	x = x >= 0 ? x : POST_lookup(req, res);
	if(0 == x) return;
	if(x > 0) return http_error(req, res, x);


	if("GET" !== req.method && "HEAD" !== req.method) return http_error(req, res, 404, "Not found");
	if(/\.\./.test(url)) return http_error(req, res, 403, "Forbidden");
	if(/\/$/.test(url)) url += "index.html";
	var file = fs.createReadStream("./client"+url);
	file.on("open", function(fd) {
		res.writeHead(200, { "Content-Type": mime(url) });
		file.pipe(res); // TODO: Handle HEAD
	});
	file.on("error", function(err) {
		http_error(req, res, 404, "Not found");
	});
}
function server_create(listener) {
	if(config.key_path || config.crt_path) {
		var key = fs.readFileSync(config["key_path"]);
		var crt = fs.readFileSync(config["crt_path"]);
		var tls = https.createServer({ key: key, cert: crt }, listener);
		var raw = http.createServer(function(req, res) {
			res.writeHead(301, {
				"Location": "https://"+req.headers["host"]+":"+config["port_tls"]+req.url,
				"Content-Length": 0,
			});
			res.end();
		});
		tls.listen(config["port_tls"]);
		raw.listen(config["port_raw"]);
	} else {
		var raw = http.createServer(listener);
		raw.listen(config["port_raw"]);
	}
}


setInterval(recent_urls_update, 1000 * 60);
recent_urls_update();
server_create(listener);
workers_start();
db_pool.setup(DB_POOL_SIZE, config["db_path"], db_pool.OPEN_READWRITE);





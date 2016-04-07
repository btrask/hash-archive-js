// Copyright 2016 Ben Trask
// MIT licensed (see LICENSE for details)

var work_queue = exports;

var db_pool = require("./db_pool");

var latest_request_id = 0;
work_queue.get = function(cb) {
	db_pool.open(function(db) {
		db.get(
			"SELECT req.request_id, req.url\n"+
			"FROM requests AS req\n"+
			"LEFT JOIN responses AS res ON (req.request_id = res.request_id)\n"+
			"WHERE res.response_id IS NULL AND req.request_id > ?\n"+
			"ORDER BY req.request_time ASC LIMIT 1", latest_request_id,
		function(err, req) {
			db_pool.close(db);
			if(err) return cb(err, null);
			if(!req) return cb(null, null);

			// Detect massive race condition where someone else
			// picks this request before we start...
			if(req.request_id <= latest_request_id) return work_queue.get(cb);
			latest_request_id = req.request_id;

			cb(null, req);
		});
	});
};


// TODO: This should probably be a separate file?
// Or come up with a better grouping...

var cluster = require("cluster");
var crypto = require("crypto");
var fs = require("fs");
var os = require("os");
var pathm = require("path");
var spawn = require("child_process").spawn;
var zlib = require("zlib");

var config = require("./config_obj");

function mkdirpSync(path, mode) {
	var err = null;
	try { fs.mkdirSync(path, mode); }
	catch(e) { err = e; }
	if(!err) return;
	if("EEXIST" === err.code) return;
	if("ENOENT" !== err.code) throw err;
	mkdirpSync(pathm.dirname(path), mode);
	fs.mkdirSync(path, mode);
}

function db_dump() {
	var tmp = pathm.join(config["tmp_dir"], crypto.randomBytes(8).toString("hex"));
	var sqlite = spawn("sqlite3", [config["db_path"], ".dump"]);
	var gzip = new zlib.Gzip({ level: 9 });
	var file = fs.createWriteStream(tmp, { mode: parseInt("600", 8) });
	sqlite.stdout.pipe(gzip).pipe(file);
	file.on("finish", function() {
		fs.rename(tmp, config["db_snapshot_path"]);
	});
	file.on("error", function(err) {
		console.log(err);
	});
}

if(cluster.isMaster) {
	mkdirpSync(config["tmp_dir"], parseInt("700", 8));
	var exists = true;
	try { fs.statSync(config["db_snapshot_path"]); }
	catch(e) { exists = false; }
	setTimeout(function() {
		db_dump();
		setInterval(db_dump, 1000 * 60 * 60 * 24);
	}, !exists ? 0 : 1000 * 60 * 10);
}


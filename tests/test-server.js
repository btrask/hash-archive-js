#!/usr/bin/env node
// Copyright 2016 Ben Trask
// MIT licensed (see LICENSE for details)

var http = require("http");
var qs = require("querystring");
var urlm = require("url");

var PORT = 8080;
var HZ = 10;

http.createServer(function(req, res) {
	var opts = urlm.parse(req.url, true).query;
	var type = opts.type || "application/octet-stream";
	var len = parseInt(opts["length"], 10) || 1024*1024*1024;
	var speed = parseInt(opts["kbps"], 10) || 1;
	var buf = new Buffer(Math.ceil(1024/8*speed) / HZ).fill(0);
	res.writeHead(200, {
		"Content-Type": type,
		"Content-Length": len,
	});
	var interval = setInterval(function() {
		if(len < buf.length) {
			res.write(buf.slice(0, len));
			clearInterval(interval);
			res.end();
			return;
		} else {
			res.write(buf);
			len -= buf.length;
		}
	}, 1000 / HZ);
}).listen(PORT);


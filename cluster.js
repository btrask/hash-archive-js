#!/usr/bin/env node
// Copyright 2016 Ben Trask
// MIT licensed (see LICENSE for details)

var cluster = require("cluster");
var os = require("os");

var work_queue = require("./work_queue");
var db_pool = require("./db_pool");
var db_open = db_pool.open;
var db_close = db_pool.close;

var config = require("./config_obj");

// https://stackoverflow.com/a/6274381
function shuffle(a) {
	var j, x, i;
	for (i = a.length; i; i -= 1) {
		j = Math.floor(Math.random() * i);
		x = a[i - 1];
		a[i - 1] = a[j];
		a[j] = x;
	}
}

var bored_workers = [];
function send_work(worker, msg) {
	work_queue.get(function(err, req) {
		if(err) throw err;
		if(!req) {
			bored_workers.push(worker);
			shuffle(bored_workers); // Fix pessimal scheduling.
			return;
		}
		worker.send({ cmd: "work", req: req });
	});
}
function add_work(worker, msg) {
	if(!bored_workers.length) return;
	var w = bored_workers.pop();
	work_queue.get(function(err, req) {
		if(err) throw err;
		// Note: At this point, req must be assigned!
		// Otherwise we "lose" it, at least until the process
		// is restarted.
		w.send({ cmd: "work", req: req });
	});
}

function message_bug(worker) {
	// In Node 4.4.2, worker is not passed.
	worker.on("message", function(msg, handle) {
		cluster.emit("message-fixed", worker, msg, handle);
	});
}
function master() {
	cluster.on("message-fixed", function(worker, msg) {
		switch(msg.cmd) {
		case "send_work": send_work(worker, msg); return;
		case "add_work": add_work(worker, msg); return;
		}
	});

	for(var i = 0; i < os.cpus().length; i++) {
		message_bug(cluster.fork());
	}
	db_pool.setup(1, config["db_path"], db_pool.OPEN_READWRITE);
}

if(cluster.isMaster) {
	master();
} else {
	require("./index");
}


#!/usr/bin/env node

var sqlite = require("sqlite3");

if(process.argv.length <= 2) {
	console.log("Usage: sqlite_busy db");
	process.exit(1);
}

var path = process.argv[2];
var db1 = new sqlite.Database(path);
var db2 = new sqlite.Database(path);

db1.run("BEGIN IMMEDIATE", function(err) {
	timeout(db2, 1000, function() {
		timeout(db2, 2000, function() {
			
		});
	});
});


function timeout(db, time, cb) {
//	db2.configure("busyTimeout", 5000);
	db2.run("PRAGMA busy_timeout = "+time, function(err) {
		if(err) throw err;
		var t1 = +new Date;
		db.run("BEGIN IMMEDIATE", function(err) {
			if(!err) throw new Error("Not a timeout!");
			var t2 = +new Date;
			console.log(t2-t1);
			if(t2-t1 < time) throw new Error("Timeout not respected!");
			cb();
		});
	});
}


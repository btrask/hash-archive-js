// Copyright 2016 Ben Trask
// MIT licensed (see LICENSE for details)

var db_pool = exports;

var sqlite = require("sqlite3");

var db_waiting = [];
var db_available = [];

db_pool.OPEN_READWRITE = sqlite.OPEN_READWRITE;

db_pool.setup = function(num, path, mode) {
	for(var i = 0; i < num; i++) {
		var db = new sqlite.Database(path, mode,
		function() {
			db.run("PRAGMA busy_timeout = 5000", function(err) {
				if(err) throw err;
				db_pool.close(db);
			});
		});
	}
};

db_pool.open = function(cb) {
	if(db_available.length) {
		cb(db_available.pop());
	} else {
		db_waiting.push(cb);
	}
};
db_pool.close = function(db) {
	if(db_waiting.length) {
		db_waiting.pop()(db);
	} else {
		db_available.push(db);
	}
};


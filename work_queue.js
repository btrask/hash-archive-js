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


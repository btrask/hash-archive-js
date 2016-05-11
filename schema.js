// Copyright 2016 Ben Trask
// MIT licensed (see LICENSE for details)

var schema = exports;

schema.insert_request = function(db, url, request_time, cb) {
	db.run(
		"INSERT INTO requests (url, request_time)\n"+
		"VALUES (?, ?)",
		url, request_time,
	function(err) {
		if(err) return cb(err, null);
		return cb(null, {
			request_id: this.lastID,
			url: url,
			request_time: request_time,
		});
	});
};
schema.insert_response = function(db, req, res, cb) {
	db.run(
		"INSERT INTO responses (request_id, status, response_time,\n"+
		"\t"+"content_type, etag, last_modified, date)\n"+
		"VALUES (?, ?, ?, ?, ?, ?, ?)",
		req.request_id, res.status, res.response_time,
		res.content_type, res.etag, res.last_modified, res.date,
	function(err) {
		if(err) return cb(err, null);
		var response_id = this.lastID;
		response_store_hashes(db, response_id, res.hashes, function(err) {
			if(err) return cb(err, null);
			cb(null, response_id);
		});
	});
};

function response_store_hashes(db, response_id, hashes, cb) {
	var algos = Object.keys(hashes);
	var i = 0;
	(function next() {
		if(i >= algos.length) return cb(null);
		var algo = algos[i];
		var data = hashes[algo];
		if(!data) return next(i++);
		if(!Buffer.isBuffer(data)) throw new Error("Invalid hash type "+typeof data);
		db.run(
			"INSERT OR IGNORE INTO hashes (algo, data)\n"+
			"VALUES (?, ?)", algo, data,
		function(err) {
			if(err) return cb(err);
			db.get(
				"SELECT hash_id FROM hashes\n"+
				"WHERE algo = ? AND data = ? LIMIT 1",
				algo, data,
			function(err, insertion) {
				if(err) return cb(err);
				if(!insertion) return cb(new Error("Couldn't find hash"));
				db.run(
					"INSERT INTO response_hashes (response_id, hash_id)\n"+
					"VALUES (?, ?)", response_id, insertion.hash_id,
				function(err) {
					if(err) return cb(err);
					next(i++);
				});
			});
		});
	})();
}



PRAGMA application_id = 404;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS requests (
	request_id INTEGER PRIMARY KEY,
	url TEXT NOT NULL,
	request_time INTEGER NOT NULL
);
CREATE INDEX request_urls ON requests (url);

CREATE TABLE IF NOT EXISTS responses (
	response_id INTEGER PRIMARY KEY,
	request_id INTEGER NOT NULL,
	status INTEGER NOT NULL,
	response_time INTEGER NOT NULL,
	content_type TEXT,
	etag TEXT,
	last_modified TEXT,
	date TEXT
);
CREATE INDEX response_requests ON responses (request_id);

CREATE TABLE IF NOT EXISTS hashes (
	hash_id INTEGER PRIMARY KEY,
	algo TEXT NOT NULL,
	data BLOB NOT NULL
);
CREATE UNIQUE INDEX hash_index ON hashes (algo, data);

CREATE TABLE IF NOT EXISTS response_hashes (
	rh_id INTEGER PRIMARY KEY,
	response_id INTEGER NOT NULL,
	hash_id INTEGER NOT NULL
);
CREATE UNIQUE INDEX response_to_hash ON response_hashes (response_id, hash_id);
CREATE UNIQUE INDEX hash_to_response ON response_hashes (hash_id, response_id);


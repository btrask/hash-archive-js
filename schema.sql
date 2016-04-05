
PRAGMA application_id = 404;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS requests (
	request_id INTEGER PRIMARY KEY,
	url TEXT NOT NULL,
	request_time INTEGER NOT NULL
);

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

CREATE TABLE IF NOT EXISTS wrapped_inner_requests (
	wir_id INTEGER PRIMARY KEY,
	wrapper_response_id INTEGER NOT NULL REFERENCES responses (response_id),
	inner_request_id INTEGER NOT NULL REFERENCES requests (request_id)
);
CREATE UNIQUE INDEX wrapper_to_inner ON wrapped_inner_requests (wrapper_response_id, inner_request_id);
CREATE UNIQUE INDEX inner_to_wrapper ON wrapped_inner_requests (inner_request_id, wrapper_response_id);

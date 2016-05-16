
PRAGMA application_id = 404;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;


-- requests.url is nullable to support nested requests that don't have global
-- identifiers. For example files inside of compressed archives.
-- The alternative was to invent global identifiers for nested content:
-- such as http://example.com/archive.zip#path/to/file.rar#file.txt
-- However, that idea was determined to be non-standard and to have too many
-- problems (such as with the way Hash Archive history URLs are constructed).
-- TODO: Rename to requests.uri as we support BitTorrent and IPFS?
CREATE TABLE IF NOT EXISTS requests (
	request_id INTEGER PRIMARY KEY,
	url TEXT,
	request_time INTEGER NOT NULL
);
-- Use a unique index to prevent importing the same data multiple times.
CREATE UNIQUE INDEX request_urls ON requests (url, request_time);

CREATE TABLE IF NOT EXISTS responses (
	response_id INTEGER PRIMARY KEY,
	request_id INTEGER NOT NULL,
	status INTEGER NOT NULL,
	response_time INTEGER NOT NULL,
	content_type TEXT
);
CREATE UNIQUE INDEX response_requests ON responses (request_id);
CREATE INDEX response_times ON responses (response_time, response_id);
-- It may seem tempting to create an index on response status,
-- but don't bother because it has extremely low selectivity.
-- If you run ANALYZE, SQLite won't even use it.

CREATE TABLE IF NOT EXISTS http_responses (
	http_response_id INTEGER PRIMARY KEY,
	response_id INTEGER NOT NULL,
	etag TEXT,
	last_modified TEXT,
	date TEXT
);
CREATE UNIQUE INDEX http_response_ids ON http_responses (response_id);

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

CREATE TABLE IF NOT EXISTS nested_requests (
	nested_request_id INTEGER PRIMARY KEY,
	parent_response_id INTEGER NOT NULL,
	child_request_id INTEGER NOT NULL
);
CREATE UNIQUE INDEX nested_parents ON nested_requests (parent_response_id, child_request_id);
CREATE UNIQUE INDEX nested_children ON nested_requests (child_request_id, parent_response_id);


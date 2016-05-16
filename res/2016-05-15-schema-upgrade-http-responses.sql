BEGIN IMMEDIATE TRANSACTION;

CREATE TABLE responses_new (
	response_id INTEGER PRIMARY KEY,
	request_id INTEGER NOT NULL,
	status INTEGER NOT NULL,
	response_time INTEGER NOT NULL,
	content_type TEXT
);
CREATE TABLE http_responses (
	http_response_id INTEGER PRIMARY KEY,
	response_id INTEGER NOT NULL,
	etag TEXT,
	last_modified TEXT,
	date TEXT
);

INSERT INTO responses_new (response_id, request_id, status, response_time, content_type)
SELECT response_id, request_id, status, response_time, content_type FROM responses;

INSERT INTO http_responses (response_id, etag, last_modified, date)
SELECT response_id, etag, last_modified, date FROM responses;

DROP TABLE responses;

ALTER TABLE responses_new RENAME TO responses;

CREATE UNIQUE INDEX response_requests ON responses (request_id);
CREATE INDEX response_times ON responses (response_time, response_id);
CREATE UNIQUE INDEX http_response_ids ON http_responses (response_id);

COMMIT;


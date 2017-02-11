#!/usr/bin/env node
// Copyright 2016 Jesse Weinstein
// MIT licensed (see LICENSE for details)

var warc_import = exports;

var streamm = require("stream");
var fs = require('fs')
const zlib = require('zlib');

var warc = require('warc');
var HTTPParser = require('http-parser-js').HTTPParser;

var hashm = require("./hash");

warc_import.open = function(path) {
    if (warc_import.check(fs.createReadStream(path), path, function(answer) {
        process.stdout.write(JSON.stringify(answer));
    })) {
        process.stderr.write("Starting WARC processing...\n");
    } else {
        process.stderr.write("Not a WARC!");
    }
}

warc_import.check = function(stream, filename, cb) {
    var f = filename.toLowerCase();
    if (/\.warc.gz$/.test(f)) {
        var gunzip = new zlib.Gunzip();
        warc_import.doit(stream.pipe(gunzip), cb);
        return true;
    }
    else if (/\.warc$/.test(f)) {
        warc_import.doit(stream, cb);
        return true;
    }
    return false;
}

warc_import.doit = function(stream, cb) {
    var full_answer = [];
    var done = false, incompleteHashJobs = 0, incompleteNestedJobs = 0;
    var maybe_finish = function() {
        if (done && incompleteHashJobs == 0 && incompleteNestedJobs == 0) {
            cb(full_answer);
        }
    }
    var w = new warc();

    stream.pipe(w);

    w.on('data', function (data) {
        process.stderr.write(data.headers['WARC-Record-ID']+"\n")
	if (data.headers['WARC-Type'] !== 'response') {
            return;
        }

	//console.log(data.headers['WARC-Target-URI']);
	var parser = new HTTPParser(HTTPParser.RESPONSE);
	var data_stream = streamm.PassThrough();
	var headers = {}, statusCode;
	parser.onHeadersComplete = function(info) {
	    for (var i = 0; i < info.headers.length; i += 2) {
		headers[info.headers[i].toLowerCase()] = info.headers[i+1]
	    }
	    //console.log('headers', headers);
	    statusCode = info.statusCode;
	};
	parser.onBody = function(chunk, offset, len) {
	    //console.log("body", chunk.toString('utf8', offset, offset + len))
	    data_stream.write(chunk.slice(offset, offset + len))
	}
	parser.onMessageComplete = function() {
            var maybe_push = function() {
                if (answer.hashes && nestedJobFinished) {
                    full_answer.push(answer);
                    maybe_finish();
                }
            }
            var nested_cb = function(ans) {
                incompleteNestedJobs += -1;
                nestedJobFinished = true;
                answer.children = ans;
                maybe_push();
            };
            var answer = {
                url: data.headers['WARC-Target-URI'],
		status: statusCode,
		content_type: headers["content-type"],
		etag: headers["etag"],
		last_modified: headers["last-modified"],
		date: headers["date"],
		response_time: +new Date,
	    }
            var nestedJobFinished = true;
	    //console.log('complete');

	    data_stream.end();
            if (warc_import.check(data_stream, data.headers['WARC-Target-URI'], nested_cb)) {
                incompleteNestedJobs += 1;
                nestedJobFinished = false;
            }
            incompleteHashJobs += 1;

            hashm.hashStream(data_stream, function(err, hashes, length) {
                if (err) throw err;
                process.stderr.write('hashed ' + data.headers['WARC-Target-URI'] + "\n");
                incompleteHashJobs += -1;
                answer.hashes = hashes;
		answer.content_length = length;
                maybe_push();
            });
	}
	parser.execute(data.content);
    });
    w.on('end', function() {
	process.stderr.write('Finished WARC processing\n');
        done = true;
        maybe_finish();
    });
}

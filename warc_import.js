#!/usr/bin/env node
// Copyright 2016 Jesse Weinstein
// MIT licensed (see LICENSE for details)

var warc_import = exports;

var streamm = require("stream");
var fs = require('fs')

var warc = require('warc');
var HTTPParser = require('http-parser-js').HTTPParser;

var hashm = require("./hash");

warc_import.open = function(path) {
    warc_import.doit(fs.createReadStream(path))
}

warc_import.doit = function(res) {
    var answer = {};
    var w = new warc();
    var done = false, incompleteHashJobs = 0;
    var maybe_finish = function() {
        if (done && incompleteHashJobs == 0) {
            console.log(answer);
        }
    }

    res.pipe(w);

    w.on('data', function (data) {
        console.log(data.headers['WARC-Record-ID'])
	if (data.headers['WARC-Type'] !== 'response') return;

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
	    //console.log('complete');
	    data_stream.end();
            if (/\.warc$/.test(data.headers['WARC-Target-URI'].toLowerCase())) {
                warc_import.doit(data_stream);
            }
            incompleteHashJobs += 1;
            hashm.hashStream(data_stream, function(err, hashes, length) {
                if (err) throw err;
                console.log('hashed ' + data.headers['WARC-Target-URI']);
                answer[data.headers['WARC-Target-URI']] = {
		    status: statusCode,
		    content_type: headers["content-type"],
		    etag: headers["etag"],
		    last_modified: headers["last-modified"],
		    date: headers["date"],
		    response_time: +new Date,
		    content_length: length,
		    hashes: hashes
		}
                incompleteHashJobs += -1;
                maybe_finish();
            });
	}
	parser.execute(data.content);
    });
    w.on('end', function() {
	console.log('Finished WARC processing');
        done = true;
        maybe_finish();
    });
}

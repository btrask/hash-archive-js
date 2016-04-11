// Copyright 2016 Ben Trask
// MIT licensed (see LICENSE for details)

var templates = exports;

var fs = require("fs");
var pathm = require("path");

var commonmark = require("commonmark");

var has = require("./has");
var hashm = require("./hash");
var errno = require("./errno");

var types = [
	"hash-uri",
	"named-info",
	"multihash",
	"prefix",
];
var algos = [
	"sha256",
	"sha384",
	"sha512",
	"sha1",
	"md5",
];
var algos_modern = {
	"sha256": true,
	"sha384": true,
	"sha512": true,
};

function buf_eq(a, b) {
	if(a === b) return true;
	if(!a || !b) return false;
	return a.equals(b);
}

function html_escape(str) { // Security critical
	return str.
		replace(/&/g, "&amp;").
		replace(/</g, "&lt;").
		replace(/>/g, "&gt;").
		replace(/"/g, "&quot;").
		replace(/'/g, "&apos;").
		replace(/\//g, "&#x2F;");
}
function date_html(label, ts) {
	var months = [
		"January",
		"February",
		"March",
		"April",
		"May",
		"June",
		"July",
		"August",
		"September",
		"October",
		"November",
		"December",
	];
	var suffix = ["th","st","nd","rd","th","th","th","th","th","th"];
	var x = new Date(ts);
	var y = x.getFullYear();
	var m = months[x.getMonth()];
	var d = x.getDate();
	var s = "<sup>"+suffix[d%10]+"</sup>";
	return "<div class=\"date\">"+html_escape(label)+" "+m+" "+d+s+", "+y+"</div>";
}
function link_html(type, uri_unsafe) {
	var uri = html_escape(uri_unsafe);
	switch(type) {
	case "web-url":
		return "<a href=\"/history/"+uri+"\">"+uri+"</a>"+
			"<sup>[<a href=\""+uri+"\" rel=\"nofollow\""+
				"target=\"_blank\">^</a>]</sup>";
	case "hash-uri":
	case "named-info":
		return "<a href=\"/sources/"+uri+"\">"+uri+"</a>"+
			"<sup>[<a href=\""+uri+"\" rel=\"nofollow\">#</a>]</sup>";
	case "multihash":
	case "prefix":
		return "<a href=\"/sources/"+uri+"\">"+uri+"</a>";
	case "raw":
		return "<a href=\""+uri+"\">"+uri+"</a>"
	case "none":
		return "<span>"+uri+"</span>";
	}
}
function item_html(type, label, uri_unsafe, deprecated) {
	var cls = deprecated ? "deprecated" : "";
	return "<li class=\"break "+cls+"\">"+label+
		link_html(type, uri_unsafe)+
		"</li>";
}
function direct_link_html(type, uri_unsafe) {
	var uri = html_escape(uri_unsafe);
	switch(type) {
	case "web-url":
	case "hash-uri":
	case "named-info":
		return "<a href=\""+uri+"\" rel=\"nofollow\">"+uri+"</a>"
	case "multihash":
	case "prefix":
		return "<span>"+uri+"</span>";
	}
}

function Template(path) {
	var t = this;

	var dir = pathm.join(pathm.dirname(process.argv[1]), "templates");
	try { fs.symlinkSync(dir, "./templates") }
	catch(e) {}

	var rest = fs.readFileSync(path, "utf8");
	var rx = /{{([\w\d-]+)}}/, match;
	t.parts = [];

	while((match = rx.exec(rest))) {
		t.parts.push({ str: rest.slice(0, match.index), val: match[1] });
		rest = rest.slice(match.index+match[0].length);
	}
	t.parts.push({ str: rest, val: null });
}
Template.prototype.write = function(stream, obj) {
	var t = this;
	for(var i = 0; i < t.parts.length; i++) {
		var str = t.parts[i].str;
		var val = t.parts[i].val;
		stream.write(str, "utf8");
		if(!val) continue;
		if(!has(obj, val)) throw new Error("Template expected "+val);
		stream.write(obj[val], "utf8");
	}
};
Template.prototype.toString = function(obj) {
	var t = this;
	var x = [];
	for(var i = 0; i < t.parts.length; i++) {
		var str = t.parts[i].str;
		var val = t.parts[i].val;
		x.push(str);
		if(!val) continue;
		if(!has(obj, val)) throw new Error("Template expected "+val);
		x.push(obj[val]);
	}
	return x.join("");
}

var index = new Template("./templates/index.html");
templates.index = function(stream, example_url, example_hash, recent_urls) {
	var examples = [];
	var obj = hashm.parse(example_hash);
	var variants = hashm.variants(obj.algo, obj.data);

	var recent = [];
	recent_urls.forEach(function(url) {
		recent.push(item_html("web-url", "", url));
	});

	var critical = [
		"https://mirrors.kernel.org/linuxmint//stable/17.3/linuxmint-17.3-cinnamon-64bit.iso",
		"https://code.jquery.com/jquery-2.2.3.min.js",
		"https://ajax.googleapis.com/ajax/libs/jquery/2.1.4/jquery.min.js",
		"https://ftp-master.debian.org/keys/archive-key-8.asc",
		"http://cdimage.debian.org/debian-cd/8.4.0/amd64/iso-cd/SHA256SUMS",
		"http://heanet.dl.sourceforge.net/project/keepass/KeePass%202.x/2.32/KeePass-2.32.zip",
		"http://openwall.com/signatures/openwall-signatures.asc",
		"http://rpmfusion.org/keys?action=AttachFile&do=view&target=RPM-GPG-KEY-rpmfusion-free-fedora23",
	].map(function(url) {
		return item_html("web-url", "", url, false);
	});

	index.write(stream, {
		"web-url-example": link_html("web-url", example_url),
		"hash-uri-example": link_html("hash-uri", variants["hash-uri"]),
		"named-info-example": link_html("named-info", variants["named-info"]),
		"multihash-example": link_html("multihash", variants["multihash"]),
		"prefix-example": link_html("prefix", variants["prefix"]),
		"examples": examples.join("\n"),
		"recent-list": recent.join("\n"),
		"critical-list": critical.join("\n"),
	});
	stream.end();
};

var history = {
	header: new Template("./templates/history-header.html"),
	footer: new Template("./templates/history-footer.html"),
	entry: new Template("./templates/history-entry.html"),
	outdated: new Template("./templates/history-outdated.html"),
	error: new Template("./templates/history-error.html"),
};
templates.history = function(stream, url, outdated, responses) {
	var url_hash = hashm.hash_buf("sha256", url, "utf8").toString("hex");

	history.header.write(stream, {
		"url": url,
		"url-link": direct_link_html("web-url", url),
		"outdated": outdated ? history.outdated.toString({}) : "",
		"wayback-url": "https://web.archive.org/web/*/"+html_escape(url),
		"google-url": "https://webcache.googleusercontent.com/search?q=cache:"+html_escape(url),
		"virustotal-url": "https://www.virustotal.com/en/url/"+html_escape(url_hash)+"/analysis/",
	});

	for(var i = 0, j; i < responses.length; i = j) {
		var res = responses[i];
		if(200 != res.status) {
			history.error.write(stream, {
				"date": date_html("As of", res.response_time),
				"error": errno.strerror(res.status)+" ("+res.status+")",
			});
			continue;
		}
		var dups = [];
		for(j = i+1; j < responses.length; j++) {
			var r2 = responses[j];
			if(!buf_eq(res.hashes["sha256"], r2.hashes["sha256"])) break;
			dups.push(date_html("Also seen", r2.response_time));
		}
		var lists = {};
		types.forEach(function(type) {
			lists[type] = [];
		});
		algos.forEach(function(algo) {
			if(!has(res.hashes, algo)) return;
			var variants = hashm.variants(algo, res.hashes[algo]);
			var modern = has(algos_modern, algo);
			types.forEach(function(type) {
				if(!variants[type]) return;
				lists[type].push(item_html(type, "", variants[type], !modern));
			});
		});
		history.entry.write(stream, {
			"date": date_html("As of", res.response_time),
			"hash-uri-list": lists["hash-uri"].join(""),
			"named-info-list": lists["named-info"].join(""),
			"multihash-list": lists["multihash"].join(""),
			"prefix-list": lists["prefix"].join(""),
			"dates": dups.join(""),
		});
	}

	history.footer.write(stream, { "url": url });
	stream.end();
};


var sources = {
	header: new Template("./templates/sources-header.html"),
	footer: new Template("./templates/sources-footer.html"),
	entry: new Template("./templates/sources-entry.html"),
	weak: new Template("./templates/sources-weak.html"),
	short: new Template("./templates/sources-short.html"),
	notfound: new Template("./templates/sources-notfound.html"),
};
templates.sources = function(stream, hash, history) {
	var obj = hashm.parse(hash);
	if(!obj) throw new Error("Invalid hash");

	var warning = "";
	if(obj.data.length < 12) { // Yes, 12 bytes is even shorter than short.
		warning = sources.short.toString({});
	} else if(!has(algos_modern, obj.algo)) {
		warning = sources.weak.toString({});
	}

	sources.header.write(stream, {
		"hash": hash,
		"hash-link": direct_link_html(obj.type, hash),
		"weak-hash-warning": warning,
		"virustotal-url": "https://www.virustotal.com/en/file/"+html_escape(obj.data.toString("hex"))+"/analysis/",
	});

	for(var i = 0; i < history.length; i++) {
		var hist = history[i];
		sources.entry.write(stream, {
			"date": date_html("Last seen", hist.response_time),
			"url": link_html("web-url", hist.url),
			"obsolete": hist.active ? "" : "obsolete",
		});
	}
	if(!history.length) {
		sources.notfound.write(stream, {});
	}

	sources.footer.write(stream, {});
	stream.end();
};


var critical = {
	header: new Template("./templates/critical-header.html"),
	footer: new Template("./templates/critical-footer.html"),

	urls: critical_urls_html(fs.readFileSync(pathm.join(pathm.dirname(process.argv[1]), "CRITICAL_URLS.md"), "utf8")),
};
templates.critical = function(stream) {
	critical.header.write(stream);

	// TODO
	stream.write(critical.urls, "utf8");

	critical.footer.write(stream);
	stream.end();
};
function critical_urls_html(str) {
	var parser = new commonmark.Parser();
	var renderer = new commonmark.HtmlRenderer();
	var ast = parser.parse(str);
	return renderer.render(ast);
}


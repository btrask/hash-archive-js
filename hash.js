// Copyright 2016 Ben Trask
// MIT licensed (see LICENSE for details)

var hashm = exports;

var crypto = require("crypto");

var multihash = require("multihashes");
var bs58 = require("bs58");

var has = require("./has");

var algo_to_mh = {
	"sha1": "sha1",
	"sha256": "sha2-256",
	"sha512": "sha2-512",
	"sha3": "sha3",
};
var mh_to_algo = map_invert(algo_to_mh);

function map_invert(obj) {
	var x = {};
	Object.keys(obj).forEach(function(key) {
		x[obj[key]] = key;
	});
	return x;
}

function base64_url_enc(buf) {
	return buf.toString("base64").replace(/\//g, "_").replace(/\+/g, "-").replace(/=/g, "");
}
function base64_url_dec(str) {
	return new Buffer(str.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

hashm.parse = function(hash) {
	var hu = /^hash:\/\/([\w\d.-]+)\/([\w\d.%_-]+)(\?[\w\d.%_=&-]+)?(#[\w\d.%_-]+)?$/i;
	var pfx = /^([\w\d]+)-([\w\d/+=]+)$/;
	var ni = /^ni:\/\/\/([\w\d.-]+);([\w\d_-]+)$/i;
	var mh = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{8,}$/;
	var ssb = /\&([a-zA-Z0-9+\/]{8,}={0,3})\.([a-z0-9]{3,})/;
	var match;
	if((match = hu.exec(hash))) return {
		type: "hash-uri",
		algo: match[1].toLowerCase(),
		data: new Buffer(match[2], "hex"),
	};
	if((match = pfx.exec(hash))) return {
		type: "prefix",
		algo: match[1].toLowerCase(),
		data: new Buffer(match[2], "base64"),
	};
	if((match = ni.exec(hash))) return {
		type: "named-info",
		algo: match[1].toLowerCase(),
		data: base64_url_dec(match[2]),
	};
	if((match = mh.exec(hash))) {
		try {
			var x = new Buffer(bs58.decode(hash));
			var obj = multihash.decode(x);
			return {
				type: "multihash",
				algo: has(mh_to_algo, obj.name) ? mh_to_algo[obj.name] : obj.name,
				data: obj.digest,
			};
		} catch(e) {}
	};
	if((match = ssb.exec(hash))) return {
		type: "ssb",
		algo: match[2],
		hash: new Buffer(match[1], "base64"),
	};
	return null;
}
hashm.format = function(type, algo, data) {
	switch(type) {
		case "hash-uri":
			return "hash://"+algo+"/"+data.toString("hex");
		case "named-info":
			return "ni:///"+algo+";"+base64_url_enc(data);
		case "prefix":
			return algo+"-"+data.toString("base64");
		case "multihash":
			if(!has(algo_to_mh, algo)) return null;
			return bs58.encode(multihash.encode(data, algo_to_mh[algo]));
		case "ssb":
			return "&"+data.toString("base64")+"."+algo;
		default: return null;
	}
}
hashm.normalize = function(hash) {
	var obj = hashm.parse(hash);
	if(!obj) return null;
	return hashm.format(obj.type, obj.algo, obj.data);
}
hashm.variants = function(algo, data) {
	var types = [
		"hash-uri",
		"hash-uri-b64",
		"named-info",
		"prefix",
		"ssb",
		"multihash",
	];
	var obj = {};
	for(var i = 0; i < types.length; i++) {
		obj[types[i]] = hashm.format(types[i], algo, data);
	}
	return obj;
}

hashm.hash_buf = function(algo, buf, enc) {
	var hasher = crypto.createHash(algo);
	hasher.end(buf, enc);
	return hasher.read();
};

hashm.hashStream = function(stream, cb) { // cb(err, hashes, length)
	var length = 0;
	var hashers = {
		"md5": crypto.createHash("md5"),
		"sha1": crypto.createHash("sha1"),
		"sha256": crypto.createHash("sha256"),
		"sha384": crypto.createHash("sha384"),
		"sha512": crypto.createHash("sha512"),
	};
	stream.on("data", function(chunk) {
		length += chunk.length;
		Object.keys(hashers).forEach(function(algo) {
			hashers[algo].write(chunk);
		});
	});
	stream.on("end", function() {
		var hashes = {};
		Object.keys(hashers).forEach(function(algo) {
			hashers[algo].end();
			hashes[algo] = hashers[algo].read();
		});
		cb(null, hashes, length);
	});
	stream.on("error", function(err) {
		cb(err, null);
	});
};


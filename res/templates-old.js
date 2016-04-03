// Copyright 2016 Ben Trask
// MIT licensed (see LICENSE for details)

var templates = exports;

var fs = require("fs");

var jsdom = require("jsdom").jsdom;

var has = require("./has");
var hashm = require("./hash");

function clone(doc, id) {
	var obj = {};
	var element = doc.getElementById(id).cloneNode(true);
	element.removeAttribute("id");
	(function findIDsInElement(elem) {
		var children = elem.childNodes, length = children.length, dataID, i;
		if(elem.getAttribute) dataID = elem.getAttribute("data-id");
		if(dataID) obj[dataID] = elem;
		for(i = 0; i < length; ++i) findIDsInElement(children[i]);
	})(element);
	obj.elem = element;
	return obj;
}
function clear(elem) {
	while(elem.hasChildNodes()) elem.removeChild(elem.firstChild);
//	elem.innerHTML = "";
	// Not sure which is faster...
}
function link(doc, type, uri) {
	var obj = clone(doc, type);
	obj.resolved.href += uri;
	obj.resolved.appendChild(doc.createTextNode(uri));
	if(obj.direct) obj.direct.href = uri;
	return obj.elem;
}

var types = [
	"hash-uri",
	"named-info",
	"multihash",
	"prefix",
];
var algos = [
	"sha256",
	"sha512",
	"sha1",
	"md5",
];
var algos_modern = {
	"sha256": true,
	"sha512": true,
};

var index = jsdom(fs.readFileSync("./templates/index.html", "utf8"));
var sources = jsdom(fs.readFileSync("./templates/sources.html", "utf8"));
var history_html = fs.readFileSync("./templates/history.html", "utf8");


/*templates.index_examples = function(doc, url, hash) {
	var obj = hashm.parse(hash);
	var variants = hashm.variants(obj.algo, obj.hash);
	var examples = doc.getElementById("examples");
	clear(examples);
	examples.appendChild(link(doc, "example-web-url", url));
	types.forEach(function(type) {
		examples.appendChild(link(doc, "example-"+type, variants[type]));
	});
};
templates.index_recent = function(doc, urls) {
	var recent = doc.getElementById("recent-list");
	clear(recent);
	for(var i = 0; i < urls.length; i++) {
		var obj = clone(doc, "recent-link");
		obj.link.href += urls[i];
		obj.link.appendChild(doc.createTextNode(urls[i]));
		recent.appendChild(obj.elem);
	}
};


templates.index_examples(index,
	"http://torrents.linuxmint.com/torrents/linuxmint-17.3-cinnamon-64bit.iso.torrent",
	"hash://sha256/212cc9f731e2237fb1e487eb5056080aeded67223f9c318cd450a30633e5dc62");
templates.index_recent(index, [
	"http://www.example.com/",
]);

templates.index = index;*/



function date(doc, type, ts) {
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
	var obj = clone(doc, type);
	obj.date.innerHTML = m+" "+d+s+", "+y;
	return obj.elem;
}

templates.history = function(url, responses) {
	var history = jsdom(fs.readFileSync("./templates/history.html", "utf8"));

//	history.defaultView.title = "History of "+url;
	var title = history.getElementsByTagName("title")[0];
	clear(title);
	title.appendChild(history.createTextNode("History of "+url));

	var title_link = history.getElementById("title-link");
	title_link.href = url;
	clear(title_link);
	title_link.appendChild(history.createTextNode(url));

	var entries = history.getElementById("entries");
	clear(entries);
	var dups = {};

	responses.forEach(function(res) {
		if(200 != res.status) {
			var error = clone(history, "error");
			error.elem.appendChild(history.createTextNode("test"));
			entries.appendChild(error.elem);
			return;
		}
		var hash = res.hashes["sha256"];
		if(has(dups, hash)) {
			dups[hash].dates.appendChild(date(history, "also-seen", res.response_time));
			return;
		}
		var entry = clone(history, "entry");
		dups[hash] = entry;
		entry.date.appendChild(date(history, "as-of", res.response_time));
		algos.forEach(function(algo) {
			var variants = hashm.variants(algo, res.hashes[algo]);
			var modern = has(algos_modern, algo);
			types.forEach(function(type) {
				if(!variants[type]) return;
				var item = link(history, "item-"+type, variants[type]);
				if(!modern) item.classList.add("deprecated");
				entry[type+"-list"].appendChild(item);
			});
		});
		entries.appendChild(entry.elem);
	});

	return history.documentElement.outerHTML;
};

//console.log(elem.innerHTML);

//templates.history






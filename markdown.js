// Copyright 2015 Ben Trask
// MIT licensed (see LICENSE for details)

var md = exports;

var commonmark = require("commonmark");

var parser = new commonmark.Parser({smart: true});
var renderer = new commonmark.HtmlRenderer({sourcepos: true});
renderer.softbreak = "<br>";

// commonmark.js should do this for us...
function normalize(node) {
	var text;
	var run = [];
	var child = node.firstChild;
	for(;;) {
		if(!child || "text" != child.type) {
			if(run.length > 1) {
				text = new commonmark.Node("text");
				text.literal = run.map(function(x) {
					x.unlink();
					return x.literal;
				}).join("");
				if(child) child.insertBefore(text);
				else node.appendChild(text);
			}
			run = [];
		}
		if(!child) break;
		if("text" == child.type) {
			run.push(child);
		} else if(child.isContainer) {
			normalize(child);
		}
		child = child.next;
	}
	return node;
}

// Ported from C version in markdown.c
// The output should be identical between each version
function md_escape(iter) {
	var event, node, p, text;
	for(;;) {
		event = iter.next();
		if(!event) break;
		if(!event.entering) continue;
		node = event.node;
		if("html_block" !== node.type) continue;

		p = new commonmark.Node("paragraph");
		text = new commonmark.Node("text");
		text.literal = node.literal;
		p.appendChild(text);
		node.insertBefore(p);
		node.unlink();
	}
}
function md_escape_inline(iter) {
	var event, node, text;
	for(;;) {
		event = iter.next();
		if(!event) break;
		if(!event.entering) continue;
		node = event.node;
		if("html" !== node.type) continue;

		text = new commonmark.Node("text");
		text.literal = node.literal;
		node.insertBefore(text);
		node.unlink();
	}
}
function md_autolink(iter) {
	// <http://daringfireball.net/2010/07/improved_regex_for_matching_urls>
	// Painstakingly ported to POSIX and then back
	var linkify = /(https?:(\/{1,3}|[a-z0-9%])|www[0-9]{0,3}[.]|[a-z0-9.-]+[.][a-z]{2,4}\/)([^\s()<>]+|(([^\s()<>]+|(([^\s()<>]+)))*))+((([^\s()<>]+|(([^\s()<>]+)))*)|[^\[\]\s`!(){};:'".,<>?«»“”‘’])/;
	var event, node, match, str, text, link, face;
	for(;;) {
		event = iter.next();
		if(!event) break;
		if(!event.entering) continue;
		node = event.node;
		if("text" !== node.type) continue;

		str = node.literal;
		while((match = linkify.exec(str))) {
			text = new commonmark.Node("text");
			link = new commonmark.Node("link");
			face = new commonmark.Node("text");
			text.literal = str.slice(0, match.index);
			link.destination = str.slice(match.index, match.index+match[0].length);
			link.__custom = true; // TODO: HACK

			face.literal = link.destination;
			link.appendChild(face);
			node.insertBefore(text);
			node.insertBefore(link);
			str = str.slice(match.index+match[0].length);
		}

		if(str !== node.literal) {
			text = new commonmark.Node("text");
			text.literal = str;
			node.insertBefore(text);
			node.unlink();
		}
	}
}
function md_convert_urls(iter) {
	var event, node, URI, hashlink, sup_open, sup_close, face;
	for(;;) {
		event = iter.next();
		if(!event) break;
		if(event.entering) continue;
		node = event.node;
		if("link" !== node.type) continue;
		if(!node.__custom) continue; // TODO: HACK

		URI = node.destination;
		if(!URI) continue;
		if("http:" !== URI.toLowerCase().slice(0, 5) &&
			"https:" !== URI.toLowerCase().slice(0, 6)
		) continue;

		hashlink = new commonmark.Node("link");
		hashlink.destination = URI;

		sup_open = new commonmark.Node("custom_inline");
		sup_close = new commonmark.Node("custom_inline");
		face = new commonmark.Node("text");
		sup_open.onEnter = "<sup>[";
		sup_close.onEnter = "]</sup>";
		face.literal = "^";
		hashlink.appendChild(face);

		node.insertAfter(sup_open);
		sup_open.insertAfter(hashlink);
		hashlink.insertAfter(sup_close);

		iter.resumeAt(sup_close, false);

		node.destination = "/history/"+URI;
	}
}
function md_convert_hashes(iter) {
	var event, node, URI, hashlink, sup_open, sup_close, face;
	for(;;) {
		event = iter.next();
		if(!event) break;
		if(event.entering) continue;
		node = event.node;
		if("link" !== node.type) continue;

		URI = node.destination;
		if(!URI) continue;
		if("hash:" !== URI.toLowerCase().slice(0, 5) &&
			"ni:" !== URI.toLowerCase().slice(0, 3)
		) continue;

		hashlink = new commonmark.Node("link");
		hashlink.destination = URI;
		hashlink.title = "Hash URI (right click and choose copy link)";

		sup_open = new commonmark.Node("custom_inline");
		sup_close = new commonmark.Node("custom_inline");
		face = new commonmark.Node("text");
		sup_open.onEnter = "<sup>[";
		sup_close.onEnter = "]</sup>";
		face.literal = "#";
		hashlink.appendChild(face);

		node.insertAfter(sup_open);
		sup_open.insertAfter(hashlink);
		hashlink.insertAfter(sup_close);

		iter.resumeAt(sup_close, false);

		node.destination = "/sources/"+URI;
	}
}

md.run = function(str) {
	var node = normalize(parser.parse(str));
	md_escape(node.walker());
	md_escape_inline(node.walker());
	md_autolink(node.walker());
	md_convert_urls(node.walker());
	md_convert_hashes(node.walker());
	// TODO: Use target=_blank for links.
	return renderer.render(node);
};



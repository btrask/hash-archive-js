// Copyright 2016 Ben Trask
// MIT licensed (see LICENSE for details)

var errno = exports;

var util = require("util");

var has = require("./has");

errno.ERR_UNKNOWN = -12400;
errno.ERR_BLOCKED = -12401;
errno.ERR_NOTFOUND = -12402;
errno.ERR_CONNREFUSED = -12403;
errno.ERR_REDIRECT = -12404;
errno.ERR_TRUNCATED = -12405;
errno.ERR_TIMEDOUT = -12406;

var generic_errors = {
	"ENOTFOUND": errno.ERR_NOTFOUND,
	"ECONNREFUSED": errno.ERR_CONNREFUSED,
	"ETIMEDOUT": errno.ERR_TIMEDOUT,
	// TODO
};
var tls_errors = {
	"CERT_HAS_EXPIRED": -12501,
	"UNABLE_TO_VERIFY_LEAF_SIGNATURE": -12502,
	"UNABLE_TO_GET_ISSUER_CERT": -12503,
	"UNABLE_TO_GET_CRL": -12504,
	"UNABLE_TO_DECRYPT_CERT_SIGNATURE": -12505,
	"UNABLE_TO_DECRYPT_CRL_SIGNATURE": -12506,
	"UNABLE_TO_DECODE_ISSUER_PUBLIC_KEY": -12507,
	"CERT_SIGNATURE_FAILURE": -12508,
	"CRL_SIGNATURE_FAILURE": -12509,
	"CERT_NOT_YET_VALID": -12510,
	"CRL_NOT_YET_VALID": -12511,
	"CRL_HAS_EXPIRED": -12512,
	"ERROR_IN_CERT_NOT_BEFORE_FIELD": -12513,
	"ERROR_IN_CERT_NOT_AFTER_FIELD": -12514,
	"ERROR_IN_CRL_LAST_UPDATE_FIELD": -12515,
	"ERROR_IN_CRL_NEXT_UPDATE_FIELD": -12516,
	"OUT_OF_MEM": -12517,
	"DEPTH_ZERO_SELF_SIGNED_CERT": -12518,
	"SELF_SIGNED_CERT_IN_CHAIN": -12519,
	"UNABLE_TO_GET_ISSUER_CERT_LOCALLY": -12520,
	"CERT_CHAIN_TOO_LONG": -12521,
	"CERT_REVOKED": -12522,
	"INVALID_CA": -12523,
	"PATH_LENGTH_EXCEEDED": -12524,
	"INVALID_PURPOSE": -12525,
	"CERT_UNTRUSTED": -12526,
	"CERT_REJECTED": -12527,
};
var tls_errors_lookup = map_invert(tls_errors);

function map_invert(obj) {
	var x = {};
	Object.keys(obj).forEach(function(key) {
		x[obj[key]] = key;
	});
	return x;
}


errno.http_strerror = function(status) {
	switch(status) {
	case 100: return "Continue";
	case 101: return "Switching Protocols";
	case 102: return "Processing"; // RFC 2518, obsoleted by RFC 4918
	case 200: return "OK";
	case 201: return "Created";
	case 202: return "Accepted";
	case 203: return "Non-Authoritative Information";
	case 204: return "No Content";
	case 205: return "Reset Content";
	case 206: return "Partial Content";
	case 207: return "Multi-Status"; // RFC 4918
	case 300: return "Multiple Choices";
	case 301: return "Moved Permanently";
	case 302: return "Moved Temporarily";
	case 303: return "See Other";
	case 304: return "Not Modified";
	case 305: return "Use Proxy";
	case 307: return "Temporary Redirect";
	case 400: return "Bad Request";
	case 401: return "Unauthorized";
	case 402: return "Payment Required";
	case 403: return "Forbidden";
	case 404: return "Not Found";
	case 405: return "Method Not Allowed";
	case 406: return "Not Acceptable";
	case 407: return "Proxy Authentication Required";
	case 408: return "Request Time-out";
	case 409: return "Conflict";
	case 410: return "Gone";
	case 411: return "Length Required";
	case 412: return "Precondition Failed";
	case 413: return "Request Entity Too Large";
	case 414: return "Request-URI Too Large";
	case 415: return "Unsupported Media Type";
	case 416: return "Requested Range Not Satisfiable";
	case 417: return "Expectation Failed";
	case 418: return "I'm a teapot";               // RFC 2324
	case 422: return "Unprocessable Entity";       // RFC 4918
	case 423: return "Locked";                     // RFC 4918
	case 424: return "Failed Dependency";          // RFC 4918
	case 425: return "Unordered Collection";       // RFC 4918
	case 426: return "Upgrade Required";           // RFC 2817
	case 428: return "Precondition Required";      // RFC 6585
	case 429: return "Too Many Requests";          // RFC 6585
	case 431: return "Request Header Fields Too Large";// RFC 6585
	case 500: return "Internal Server Error";
	case 501: return "Not Implemented";
	case 502: return "Bad Gateway";
	case 503: return "Service Unavailable";
	case 504: return "Gateway Time-out";
	case 505: return "HTTP Version Not Supported";
	case 506: return "Variant Also Negotiates";    // RFC 2295
	case 507: return "Insufficient Storage";       // RFC 4918
	case 509: return "Bandwidth Limit Exceeded";
	case 510: return "Not Extended";               // RFC 2774
	case 511: return "Network Authentication Required"; // RFC 6585
	default: return "Unknown error "+status;
	}
}
errno.strerror = function(code) {
	switch(code) {
	case errno.ERR_UNKNOWN: return "Unknown error";
	case errno.ERR_BLOCKED: return "Blocked by robots.txt";
	case errno.ERR_NOTFOUND: return "Not found";
	case errno.ERR_CONNREFUSED: return "Connection refused";
	case errno.ERR_REDIRECT: return "Too many redirects";
	case errno.ERR_TRUNCATED: return "Truncated response";
	case errno.ERR_TIMEDOUT: return "Timed out";
	case errno.ERR_CERTEXPIRED: return "Certificate expired";
	case errno.ERR_CERTLEAFSIG: return "Bad cert leaf signature";
	}
	if(has(tls_errors_lookup, code)) return tls_errors_lookup[code];
	return errno.http_strerror(code);
};
errno.createError = function(code) {
	var err = new Error(errno.strerror(code));
	err.errno = code;
	return err;
};
errno.parse = function(err) {
	if(!isNaN(err.errno)) return err.errno;
	if(has(tls_errors, err.code)) return tls_errors[err.code];
	if(has(generic_errors, err.code)) return generic_errors[err.code];
	console.log("Unknown error", util.inspect(err));
	return errno.ERR_UNKNOWN;
};


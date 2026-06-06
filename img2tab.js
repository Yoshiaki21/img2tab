// Copyright 2011 Sumeet Patel. All rights reserved

//Chrome vs Firefox
var model = chrome;
if (!chrome){
	model = browser;
}

//Handle options
var globalOptions;
model.storage.sync.get({
	tabBackgroundColor: '#000000',
	tabForegroundColor: '#FFFFFF',
	ignoreThumbs: false,
	instagramHighQuality: true,
	urlRegexMatch: null,
	urlRegexReplace: null
}, function(options) {
	globalOptions = options;
});

model.storage.onChanged.addListener(function(changes, namespace) {
	for (key in changes) {
		var storageChange = changes[key];
		globalOptions[key] = storageChange.newValue;
	}
});

// Posts image URL's to the background script
model.runtime.onMessage.addListener(function(payload, sender, sendResponse) {
	var operation = payload.operation;
	var type = payload.type;
	var singleTab = payload.singleTab;

	if (operation == "execute"){

		if (type == "confirmDialog") {
			var message = payload.message;
			var answer = window.confirm(message);
			sendResponse(answer);
			return;
		}

		if (type == "getImages") {
			getImages(singleTab, function(payload){
				//console.log(payload);
				sendResponse(payload);
			});
			return;
		}
		
		if (type == "getLinkedImages") {
			getLinkedImages(singleTab, function(payload){
				//console.log(payload);
				sendResponse(payload);
			});
			return;
		}
	}

	console.log('img2tab: unhandled message', payload);
});

var ignores = [
	"http://i.imgur.com/removed.png",
	"https://i.imgur.com/removed.png",

	"http://i.imgur.com/gallery.jpg",
	"https://i.imgur.com/gallery.jpg",

	"http://i.imgur.com/a.jpg",
	"https://i.imgur.com/a.jpg",
	
	"http://reddit.com/static/pixel.png",
	"https://reddit.com/static/pixel.png",
];

// Returns the highest-resolution URL from a srcset attribute, or null.
function getBestSrcsetUrl(srcset) {
	if (!srcset) { return null; }
	var best = null;
	var bestWeight = -1;
	var entries = srcset.split(",");
	for (var i = 0; i < entries.length; i++) {
		var parts = entries[i].trim().split(/\s+/);
		if (parts.length === 0 || !parts[0]) { continue; }
		var u = parts[0];
		var descriptor = parts[1] || "1x";
		var weight = 0;
		if (/w$/i.test(descriptor)) {
			weight = parseInt(descriptor, 10) || 0;
		} else if (/x$/i.test(descriptor)) {
			// density descriptors are small; scale so they don't lose to width descriptors of the same image
			weight = (parseFloat(descriptor) || 1) * 10000;
		}
		if (weight > bestWeight) {
			bestWeight = weight;
			best = u;
		}
	}
	return best;
}

// True if the given <img> is the thumbnail of a Pinterest video pin.
// Walks up to 5 ancestors looking for a <video> element or video-related markers.
function isVideoPinThumb(imgElement) {
	if (!imgElement) { return false; }
	if (!/(^|\.)pinterest\./i.test(location.host)) { return false; }

	var node = imgElement.parentElement;
	for (var depth = 0; depth < 5 && node; depth++) {
		if (node.querySelector) {
			if (node.querySelector("video")) { return true; }
			if (node.querySelector('[data-test-id*="video" i]')) { return true; }
			if (node.querySelector('[aria-label*="video" i]'))   { return true; }
		}
		node = node.parentElement;
	}
	return false;
}

function processUrls(urls, callback){
	/* Pre-process replacements */
	var instagramHighQuality = globalOptions.instagramHighQuality;
	var urlRegexMatch = globalOptions.urlRegexMatch;
	var urlRegexReplace = globalOptions.urlRegexReplace;

	for (var i = 0; i < urls.length; i ++) {
		var url = urls[i];

		//Improve instagram quality
		if (instagramHighQuality){
			if (url.match(/(fbcdn|cdninstagram)\.(net|com)/im)){
				//Replace things like /s640x640/ with /s1080x1080/
				url = url.replace(/\/s\d+x\d+\//img, "/");
			}
		}

		//Pinterest: replace size segment (236x, 474x, 75x75_RS, etc.) with originals
		if (url.match(/^https?:\/\/i\.pinimg\.com\//i)) {
			url = url.replace(
				/^(https?:\/\/i\.pinimg\.com\/)(\d+x\d*(?:_RS)?|originals)\//i,
				"$1originals/"
			);
		}

		var regexEnabled = urlRegexMatch 
							&& urlRegexReplace
							&& urlRegexMatch.length > 0
							&& urlRegexReplace.length > 0;

		if (regexEnabled){
			var pattern = new RegExp(urlRegexMatch, "img");
			url = url.replace(pattern, urlRegexReplace);
		}

		//console.log(regexEnabled, urlRegexMatch, urlRegexReplace);

		//bind it fully
		urls[i] = url;
	};

	callback(urls);
}

// Collates HTML image tagged images
function getImages(singleTab, callback){
	var imageUrls = new Array();
	
	var images = document.getElementsByTagName('img');
	for (var i = 0; i < images.length; i++){
		// Skip thumbnails of Pinterest video pins
		if (isVideoPinThumb(images[i])) { continue; }

		// Prefer the highest-resolution candidate from srcset, fall back to src
		var srcsetUrl = getBestSrcsetUrl(images[i].getAttribute("srcset"));
		var url = srcsetUrl || images[i].src;
		if (!url) { continue; }
		if (inArray(url, imageUrls) == -1){
			imageUrls.push(url);
		}
	}
	
	//Dont include images we dont care about
	var filtered = [];
	for (var i = 0; i < imageUrls.length; i++) {
		var imageUrl = imageUrls[i];

		//Remove ignored links
		if (ignores.indexOf(imageUrl) > -1){
			continue;
		}

		//Also deduplicate
		if (filtered.indexOf(imageUrl) > -1){
			continue;
		}

		filtered.push(imageUrl);
	};

	//Do any url replacements and callback
	processUrls(filtered, function(urls){
		var msg = {
			imageUrls : urls,
			incognito : (model.extension && model.extension.inIncognitoContext) || false,
			singleTab : singleTab,
			pageUrl   : window.location.href
		}

		callback(msg);
	});
}

// Collates Links to Images
function getLinkedImages(singleTab, callback){
	var imageUrls = new Array();
	var usedUrls = new Array();
	
	var links = document.getElementsByTagName('a');

	for (var i = 0; i < links.length; i ++) {
		var originalUrl = links[i].href;
		var url = links[i].href;
	
		var useImage = function(){
			imageUrls.push(url);
			usedUrls.push(originalUrl);
			usedUrls.push(url);
		};

		/* Identify images */

		//Allow all direct images
		if (url.match(/^(?!mailto).+\.(jpg|jpeg|gif|png|webm)+/im)){
			if (inArray(url, usedUrls) == -1){
				useImage(url);
				continue;
			}
		}
		
		//Translate imgur images
		if (url.match(/.*imgur\.com\/([m]|[a-z]|[A-Z]|[0-9]|[\/]|(.(jpg|jpeg|gif|png|webm)))+/im)){
			if (inArray(url, usedUrls) == -1){
				//Strip out hash
				var matches = url.match("imgur\.com/(\\w+)");				
				if (matches != null){
					var imgurId = matches[1];
					url = "http://i.imgur.com/" + imgurId + ".jpg";
				}

				useImage(url);
				continue;
			}
		}
	
		//Translate quickmeme images
		if (url.match(/.*qkme\.me\/([m]|[a-z]|[A-Z]|[0-9]|[\/]|(.(jpg|jpeg|gif|png|webm)))+/im)){
			if (inArray(url, usedUrls) == -1){
				//Strip out hash
				var matches = url.match("qkme\.me/(\\w+)");				
				if (matches != null){
					var imgurId = matches[1];
					url = "http://i.qkme.me/" + imgurId + ".jpg";
				}
				
				useImage(url);
				continue;
			}
		}

		//Trust reddit urls
		if (url.match(/^((http|https)*:\/\/)*i.reddit\w+\.com\//m)) {
			if (inArray(url, usedUrls) == -1){
				useImage(url);
				continue;
			}
		}

		//Some websites dont end links with their extension
		//gfycat.com
		if (url.match(/^((http|https)*:\/\/)*(thumbs\.)*gfycat.com\/[A-Z]/m)){
			if (inArray(url, usedUrls) == -1){
				useImage(url);
				continue;
			}
		}

		//Allow reddit comments, but we'll have to query the api for the source
		if (location.host == "www.reddit.com"){
			if (url.match(/^(((http|https)*:\/\/)*(www.)*reddit.com)*\/r\/\w+\/comments\/\w+\/\w+/m)){
				if (inArray(url, usedUrls) == -1){
					useImage(url);
					continue;
				}
			}
		}
	}
	
	//Dont include images we dont care about
	var filtered = [];
	for (var i = 0; i < imageUrls.length; i++) {
		var imageUrl = imageUrls[i];

		//Remove ignored links
		if (ignores.indexOf(imageUrl) > -1){
			continue;
		}

		//Also deduplicate
		if (filtered.indexOf(imageUrl) > -1){
			continue;
		}

		filtered.push(imageUrl);
	};

	//Do any url replacements and callback
	processUrls(filtered, function(urls){
		var msg = {
			imageUrls : urls,
			incognito : (model.extension && model.extension.inIncognitoContext) || false,
			singleTab : singleTab,
			pageUrl   : window.location.href
		}
		callback(msg);
	});
}
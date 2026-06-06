// Copyright 2011 Sumeet Patel. All rights reserved
// Build context menu on all document elements

//Chrome vs Firefox
var model = chrome;
if (!chrome){
	model = browser;
}

// --- Referrer 設定用 ---
// 元ページ URL と images.html のタブ ID を保持する
var referrerInfo = {
	pageUrl : null,
	tabId   : null
};

// Chrome は Referer 変更に extraHeaders が必要。Firefox は不要。
var refererListenerOptions = ["blocking", "requestHeaders"];
try {
	if (chrome &&
		chrome.webRequest &&
		chrome.webRequest.OnBeforeSendHeadersOptions &&
		"EXTRA_HEADERS" in chrome.webRequest.OnBeforeSendHeadersOptions) {
		refererListenerOptions.push("extraHeaders");
	}
} catch (e) {}

// images.html タブからの画像リクエストに Referer を付与する
model.webRequest.onBeforeSendHeaders.addListener(
	function(details) {
		// 対象タブ以外のリクエストは素通り
		if (details.tabId !== referrerInfo.tabId) { return {}; }
		if (!referrerInfo.pageUrl) { return {}; }

		// 既存の Referer ヘッダーを除去して上書き
		var headers = details.requestHeaders.filter(function(h) {
			return h.name.toLowerCase() !== "referer";
		});
		headers.push({ name: "Referer", value: referrerInfo.pageUrl });

		return { requestHeaders: headers };
	},
	{ urls: ["http://*/*", "https://*/*"] },
	refererListenerOptions
);
// --- ここまで追加 ---

var contexts = ["page","selection","link","editable","image","video","audio"];
var id = model.contextMenus.create({"title": "img2tab", "contexts": contexts});
model.contextMenus.create({"id": "actual-single", "title": "画像を一つのtabで表示",    "parentId": id, "contexts": contexts});
model.contextMenus.create({"id": "linked-single", "title": "リンク画像を一つのtabで表示", "parentId": id, "contexts": contexts});

// onClicked リスナーで一括ハンドリング
model.contextMenus.onClicked.addListener(function(info, tab) {
	switch (info.menuItemId) {
		case "actual-single": onExplodeImagesSingleClick(info, tab);       break;
		case "linked-single": onExplodeLinkedImagesSingleClick(info, tab); break;
	}
});

var pendingTabs = {};

//Wait for loaded tabs and run any pending handlers
model.tabs.onUpdated.addListener(function(tabId, info) {
	var key = "tab-" + tabId;

	if (info.status == "complete") {

		//Find a matching tab
		var keys = Object.keys(pendingTabs);
		if (keys.indexOf(key) == -1)
			return;

		//Execute the handler
		var handler = pendingTabs[key];
		handler(tabId);

		//Delete the handler
		delete pendingTabs[key];
	}
});

// Context menu button handlers
// These tell the actual page to crawl the images
function onExplodeImagesSingleClick(info, tab){
	var payload = {
		operation: 'execute',
		type: 'getImages',
		singleTab: true
	};
	model.tabs.sendMessage(tab.id, payload, function(responsePayload) {
		urlsToSingleTab(tab.id, responsePayload);
	});
}
function onExplodeLinkedImagesSingleClick(info, tab){
	var payload = {
		operation: 'execute',
		type: 'getLinkedImages',
		singleTab: true
	};
	model.tabs.sendMessage(tab.id, payload, function(responsePayload) {
		urlsToSingleTab(tab.id, responsePayload);
	});
}

// Opens a list of URL's to a new tabbed window
function urlsToSingleTab(tabId, responsePayload){
	if (!responsePayload){
		return;
	}

	var urls = responsePayload.imageUrls;
	var incognito = responsePayload.incognito;
	var pageUrl = responsePayload.pageUrl || null;

	if (urls.length == 0) {
		alert("No Images Found");
		return;
	}

	var run = function(){
		//incognito doesnt work, google has an admitted bug
		var tabOptions = {
			url: model.runtime.getURL('images.html')
		};

		model.tabs.create(tabOptions, function(tab) {
			// Referer 用にタブ ID と pageUrl を記録
			referrerInfo.tabId   = tab.id;
			referrerInfo.pageUrl = pageUrl;

			var key = "tab-" + tab.id;

			//New tab handler, tell it what to load
			var handler = function(tabId){
				//Get the options
				var fields = ['tabBackgroundColor', 'tabForegroundColor', 'ignoreThumbs'];
				model.storage.sync.get(fields, function(options) {

					var payload = {
						operation: "execute",
						type: "displayUrls",
						urls: urls,
						options: options
					};

					//Send the message
					model.tabs.sendMessage(tabId, payload, function(response) {
						//noop
					});
				});
			};

			pendingTabs[key] = handler;
		});
	}

	if (incognito){
		var confirmMsg = "The images may be shown in a non-private window. Continue?";
		confirmDialog(tabId, confirmMsg, function(answer){
			if (!answer){
				return;
			}
			run();
		});
		return;
	}

	run();
}

function confirmDialog(tabId, message, callback){
	var payload = {
		operation: "execute",
		type: "confirmDialog",
		message: message
	};

	model.tabs.sendMessage(tabId, payload, function(answer) {
		callback(answer);
	});
}


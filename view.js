// Copyright 2011 Sumeet Patel. All rights reserved
// Renders urls to the new tab

//Chrome vs Firefox
var model = chrome;
if (!chrome){
	model = browser;
}

var imageUrls = [];
var downloadableUrls = [];
var downloadedCount = 0;
var zip;

$.ajaxSetup({
	async: true
});

model.runtime.onMessage.addListener(function(payload, sender, responseCallback) {
	var operation = payload.operation;
	var type = payload.type;

	if (operation == "execute"){
		if (type == "displayUrls"){
			var urls = payload.urls;

			console.log('img2tab: urls', payload.urls);

			var options = payload.options;
			handleOptions(options);

			imageUrls = urls;
			generate(urls);
			handleOptions(options);

			return;
		}
	}

	console.log('img2tab: unhandled message', payload);
});

$(window).on('load', function() {
	$("#download").click(function(e){
		downloadAsZip();
	});

	$('#download').prop('disabled', false);
});

function handleOptions(options){
	var tabBackgroundColor = options.tabBackgroundColor;
	$(document.body).css("background-color", tabBackgroundColor);

	var tabForegroundColor = options.tabForegroundColor;
	$(document.body).css("color", tabForegroundColor);
	$('a').css('color', tabForegroundColor);

	if (options.ignoreThumbs){
		var minDimension = 150;

		$('img, iframe').load(function(){
			var width = $(this).width();
			var height = $(this).height();

			if (width < minDimension || height < minDimension){
				$(this).hide();
			}
		});
	}
}

function generate(urls){
	$("#count").text(urls.length + " items");

	urls.forEach(function(url, index){	

		//Master section
		var altClass = index % 2 == 0 ? "rowNormal" : "rowAlernate";
		var div = document.createElement('div');
		$(div).addClass(altClass);

		//Link title
		var linkText = url;
		var title = document.createElement('h3');
		var link = document.createElement('a');
		$(link).attr('href', url);
		$(link).text(linkText);
		$(title).append(link);
		$(div).append(title)
	
		var line = document.createElement('hr');
		$(div).append(line);

		$("#content").append(div);

		//Request the inner content
		getHtmlForUrl(url, function(content){
			$(div).append(content);
		});
	});
}

function getHtmlForUrl(url, callback){
	
	var imageFunc = function(imageUrl){
		var content = "<img src=\"" + imageUrl + "\"/>";
		downloadableUrls.push(imageUrl);
		callback(content);
	};

	var frameFunc = function(imageUrl){
		var content = "<iframe src=\"" + imageUrl + "\"/>";
		callback(content);
	};

	var customFunc = function(text){
		callback(text);
	};

	var errorFunc = function(text){
		callback(text);
	};

	//Reddit images without extension are images
	if (url.match(/^((http|https)*:\/\/)*i.reddit\w+\.com\//m)) {
		imageFunc(url);
		return;
	}

	//gifv format is a frame
	if (url.match("\.(gifv)")){
		frameFunc(url);
		return;
	}

	//Extension specified are images
	if (url.match("\.(jpg|jpeg|png|gif|webm)")){
		imageFunc(url);
		return;
	}

	//gfycat non-extension are frames
	if (url.match(/^((http|https)*:\/\/)*(thumbs\.)*gfycat.com\/[A-Z]/m)){
		frameFunc(url);
		return;
	}

	//Reddit comments need to use the api for source image, ie custom
	if (url.match(/^(((http|https)*:\/\/)*(www.)*reddit.com)*\/r\/\w+\/comments\/\w+\/\w+/m)){

		//Get the api url
		var apiUrl = url.replace(/\/$/m, ".json");

		//Request info from api
		$.getJSON(apiUrl, function(data) {
			if (!data){
				errorFunc("There was a problem getting the source image from reddit (no api data)");
				return;
			}
			
			var preview;
			var imageUrl;
			try {
				var redditPayload = data[0].data.children[0].data;
				preview = redditPayload.preview;

				if (preview){
					imageUrl = preview.images[0].source.url;
				}
			}
			catch(exception){
				errorFunc("There was a problem getting the source image from reddit (api data parse exception)");
				console.log('Exception');
				console.log(exception);
				console.log('Data');
				console.log(data);
				return;
			}
			
			if (!preview){
				customFunc("This reddit link has no source image");
				return;
			}

			if (!imageUrl){
				customFunc("There was a problem getting the source image from reddit (no image url)");
				return;
			}

			//Handle the source image
			imageFunc(imageUrl);
			return;
		});
		return;
	}

	//Default treat as frame
	frameFunc(url);
	return;
}

/* Download all */
function downloadAsZip(){
	$('#download').prop('disabled', true);

	zip = new JSZip();

	//Download the first file
	downloadFile(downloadableUrls[downloadedCount], downloadCompleted);
}

function downloadCompleted(blobData){
	//console.log('single download completed');
	var allFilesProgress = downloadedCount / downloadableUrls.length;
	var percentage = (allFilesProgress * 100).toFixed(0);
	$('#download').attr('value', "Downloading " + percentage + "%");

	if (downloadedCount == downloadableUrls.length - 1){
		$('#download').attr('value', "Downloading 100%");
	}

	setTimeout(function(){
		if (downloadedCount < downloadableUrls.length) {

			blobToBase64(blobData, function(binaryData){
				
				// add downloaded file to zip:
				var url = downloadableUrls[downloadedCount];
				var fileName = url.substring(url.lastIndexOf('/')+1); //only utf8

				zip.file(fileName, binaryData, {base64: true});

				if (downloadedCount < downloadableUrls.length -1){
					downloadedCount++;
					downloadFile(url, downloadCompleted);
				}
				else {
					//console.log('downloading complete');
					// all files have been downloaded, create the zip
					var content = zip.generate();

					console.log('compressing complete');

					// then trigger the download link:        
					var zipName = 'images.zip';
					var a = document.createElement('a'); 
					a.href = "data:application/zip;base64," + content;
					a.download = zipName;
					a.click();
					//saveAs(content, "images.zip");

					$('#download').prop('disabled', false);
					downloadedCount = 0;

					$('#download').attr('value', "Download all");
				}

			});
		}
	}, 10);
}

function downloadFile(url, onSuccess) {
	//console.log('download started');
	var xhr = new XMLHttpRequest();
	xhr.onprogress = calculateAndUpdateProgress;
	xhr.open('GET', url, true);
	xhr.responseType = "blob";
	xhr.onreadystatechange = function () {
		if (xhr.readyState == 4) {
			//console.log('download ready state finished');
			if (onSuccess) 
				onSuccess(xhr.response);
		}
	};
	xhr.send();
}

function blobToBase64(blob, callback) {
	var reader = new FileReader();
	reader.onload = function() {
		var dataUrl = reader.result;
		var base64 = dataUrl.split(',')[1];
		callback(base64);
	};
	reader.readAsDataURL(blob);
}

function calculateAndUpdateProgress(evt) {
	if (evt.lengthComputable) {
		//var fileProgress = evt.loaded / evt.total;
	}
}

/* ===== save-in 連携：画像をクリックで save-in に保存依頼する ===== */
/* images.html は moz-extension:// の特権ページのため save-in の content script は
   注入されない。よって save-in の外部メッセージAPI(onMessageExternal)へ直接送る。 */

// save-in 拡張のID（save-in の manifest.json: browser_specific_settings.gecko.id）
// save-in を再署名して ID が変わった場合はここを更新する
var SAVE_IN_ID = "{b6fcb779-b817-4c30-8e82-0a316c9c40b5}";

// 保存トリガーの修飾キー: "alt" | "ctrl" | "shift" | "meta"
// ※Linux(KDE/GNOME)では Alt+クリックがWMのウィンドウ移動と競合し得る。
//   その環境では "ctrl" 等に変更する。
var SAVE_MODIFIER = "alt";

function isSaveModifierPressed(e) {
	switch (SAVE_MODIFIER) {
		case "ctrl":  return e.ctrlKey;
		case "shift": return e.shiftKey;
		case "meta":  return e.metaKey;
		case "alt":
		default:      return e.altKey;
	}
}

// 画像クリックで save-in に保存を依頼（#content は動的生成のため document に委譲）
document.addEventListener("click", function(e) {
	// 左クリック + 指定修飾キーのみ反応
	if (e.button !== 0 || !isSaveModifierPressed(e)) { return; }

	// クリック対象（または祖先）の img を取得
	var img = e.target.closest ? e.target.closest("img") : null;
	if (!img) { return; }

	// 表示中の実URL（srcset 対応で currentSrc を優先）
	var url = img.currentSrc || img.src;
	if (!url) { return; }

	e.preventDefault();
	e.stopPropagation();

	var payload = {
		type: "DOWNLOAD",
		body: {
			url: url,
			// srcUrl は save-in のルーティング変数(:sourcedomain: 等)で使われる
			// comment は save-in 側の振り分けルール用ラベル（任意）
			info: { pageUrl: url, srcUrl: url, comment: "img2tab" }
		}
	};

	// save-in へ送信（view.js 既存と同じ callback スタイル）
	model.runtime.sendMessage(SAVE_IN_ID, payload, function(response) {
		if (model.runtime.lastError) {
			// save-in 未インストール/無効、またはID不一致
			console.error("img2tab→save-in 送信失敗:", model.runtime.lastError.message);
			alert("save-in に保存を依頼できませんでした。\n" +
				  "save-in がインストール・有効化されているか、SAVE_IN_ID が正しいか確認してください。");
			return;
		}
		// 送信成功の簡易フィードバック（save-in 自身の通知とは別の即時表示）
		var prev = img.style.outline;
		img.style.outline = "3px solid #4caf50";
		setTimeout(function() { img.style.outline = prev; }, 400);
	});
}, true); // capture フェーズで先に拾う
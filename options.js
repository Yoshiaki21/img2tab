//Chrome vs Firefox
var model = chrome;
if (!chrome){
	model = browser;
}

function saveOptions() {
	var tabBackgroundColor = document.getElementById('tabBackgroundColor').value;
	var tabForegroundColor = document.getElementById('tabForegroundColor').value;
	var ignoreThumbs = document.getElementById('ignoreThumbs').checked;
	var instagramHighQuality = document.getElementById('instagramHighQuality').checked;
	var urlRegexMatch = document.getElementById('urlRegexMatch').value;
	var urlRegexReplace = document.getElementById('urlRegexReplace').value;

	model.storage.sync.set({
		tabBackgroundColor: tabBackgroundColor,
		tabForegroundColor: tabForegroundColor,
		ignoreThumbs: ignoreThumbs,
		instagramHighQuality: instagramHighQuality,
		urlRegexMatch: urlRegexMatch,
		urlRegexReplace: urlRegexReplace
	}, function() {
		//saved
		console.log('Saved');
	});
}

function loadOptions() {
	$('#tabBackgroundColor').change(saveOptions);
	$('#tabForegroundColor').change(saveOptions);
	$('#ignoreThumbs').change(saveOptions);
	$('#instagramHighQuality').change(saveOptions);
	$('#urlRegexMatch').change(saveOptions);
	$('#urlRegexReplace').change(saveOptions);

	model.storage.sync.get({
		tabBackgroundColor: '#000000',
		tabForegroundColor: '#FFFFFF',
		ignoreThumbs: false,
		instagramHighQuality: true,
		urlRegexMatch: null,
		urlRegexReplace: null,
	}, function(items) {
		document.getElementById('tabBackgroundColor').value = items.tabBackgroundColor;
		document.getElementById('tabForegroundColor').value = items.tabForegroundColor;
		document.getElementById('ignoreThumbs').checked = items.ignoreThumbs;
		document.getElementById('instagramHighQuality').checked = items.instagramHighQuality;
		document.getElementById('urlRegexMatch').value = items.urlRegexMatch;
		document.getElementById('urlRegexReplace').value = items.urlRegexReplace;
	});
}

document.addEventListener('DOMContentLoaded', loadOptions);

//Option changes save right away
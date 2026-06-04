# img2tab 修正仕様書

## 概要

Firefox 拡張機能 img2tab（v1.84resigned1）に以下の2点を修正する。

1. **最新 Firefox 対応**：廃止された API を現行 API に置き換え
2. **Referrer ヘッダー付与**：画像取得時に元ページの URL を Referer として送信

## 対象ファイル

```
img2tab/
├── manifest.json   ← 修正あり
├── background.js   ← 修正あり（最大の変更）
├── img2tab.js      ← 修正あり
├── view.js         ← 修正なし
├── common.js       ← 修正なし
├── options.js      ← 修正なし
└── lib/            ← 修正なし
```

---

## 修正1：最新 Firefox 対応

### 1-1. manifest.json：webRequest 権限を追加

**現在：**
```json
"permissions": ["tabs", "contextMenus", "storage", "http://*/*", "https://*/*"]
```

**修正後：**
```json
"permissions": ["tabs", "contextMenus", "storage", "http://*/*", "https://*/*", "webRequest", "webRequestBlocking"]
```

---

### 1-2. background.js：`contextMenus.onclick` の廃止対応

Firefox 125 以降、`contextMenus.create()` の `onclick` プロパティは削除された。
`contextMenus.onClicked.addListener()` に置き換える。

**現在（12〜15行目）：**
```javascript
model.contextMenus.create({"title": "Actual (seperate tabs)", "parentId": id, "contexts": contexts, "onclick": onExplodeImagesClick});
model.contextMenus.create({"title": "Actual (single tab)", "parentId": id, "contexts": contexts, "onclick": onExplodeImagesSingleClick});
model.contextMenus.create({"title": "Linked (seperate tabs)", "parentId": id, "contexts": contexts, "onclick": onExplodeLinkedImagesClick});
model.contextMenus.create({"title": "Linked (single tab)", "parentId": id, "contexts": contexts, "onclick": onExplodeLinkedImagesSingleClick});
```

**修正後：**
- 各 `contextMenus.create()` から `onclick` プロパティを削除し、代わりに一意の `id` を付与する
- `model.contextMenus.onClicked.addListener()` を追加し、`info.menuItemId` で分岐する

```javascript
// onclick を削除し、id を付与
model.contextMenus.create({"id": "actual-separate", "title": "Actual (seperate tabs)", "parentId": id, "contexts": contexts});
model.contextMenus.create({"id": "actual-single",   "title": "Actual (single tab)",    "parentId": id, "contexts": contexts});
model.contextMenus.create({"id": "linked-separate", "title": "Linked (seperate tabs)", "parentId": id, "contexts": contexts});
model.contextMenus.create({"id": "linked-single",   "title": "Linked (single tab)",    "parentId": id, "contexts": contexts});

// onClicked リスナーで一括ハンドリング
model.contextMenus.onClicked.addListener(function(info, tab) {
    switch (info.menuItemId) {
        case "actual-separate": onExplodeImagesClick(info, tab);             break;
        case "actual-single":   onExplodeImagesSingleClick(info, tab);       break;
        case "linked-separate": onExplodeLinkedImagesClick(info, tab);       break;
        case "linked-single":   onExplodeLinkedImagesSingleClick(info, tab); break;
    }
});
```

---

### 1-3. background.js：`extension.getURL()` の廃止対応

`chrome.extension.getURL()` は非推奨。`chrome.runtime.getURL()` に置き換える。

**対象箇所（urlsToSingleTab 関数内）：**
```javascript
// 修正前
url: model.extension.getURL('images.html')

// 修正後
url: model.runtime.getURL('images.html')
```

---

### 1-4. img2tab.js：`extension.inIncognitoContext` の廃止対応

`chrome.extension.inIncognitoContext` は非推奨。フォールバック付きに変更する。

**対象箇所：`getImages()` と `getLinkedImages()` 内の msg オブジェクト（2カ所）**

```javascript
// 修正前
incognito : model.extension.inIncognitoContext,

// 修正後
incognito : (model.extension && model.extension.inIncognitoContext) || false,
```

---

## 修正2：Referrer ヘッダー付与

images.html タブで画像を読み込む際、元ページの URL を `Referer` ヘッダーとして付与する。
これにより、Referer チェックを行うサーバーからの画像取得が可能になる。

### 2-1. img2tab.js：pageUrl を送信データに追加

`getImages()` と `getLinkedImages()` 両関数内の msg オブジェクトに `pageUrl` を追加する（2カ所）。

```javascript
// 修正前
var msg = {
    imageUrls : urls,
    incognito : (model.extension && model.extension.inIncognitoContext) || false,
    singleTab : singleTab
}

// 修正後（pageUrl を追加）
var msg = {
    imageUrls : urls,
    incognito : (model.extension && model.extension.inIncognitoContext) || false,
    singleTab : singleTab,
    pageUrl   : window.location.href
}
```

---

### 2-2. background.js：Referrer 管理変数と webRequest リスナーを追加

ファイル先頭の `var model = ...` ブロックの直後、`var contexts = ...` の前に以下を追加する。

```javascript
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
```

---

### 2-3. background.js：`urlsToSingleTab()` を修正

`pageUrl` を受け取り、タブ生成時に `referrerInfo` を更新する。

**変更点：**
1. `var pageUrl = responsePayload.pageUrl || null;` を追加
2. `model.tabs.create()` のコールバック内で `referrerInfo` を更新

```javascript
function urlsToSingleTab(tabId, responsePayload){
    if (!responsePayload){
        return;
    }

    var urls = responsePayload.imageUrls;
    var incognito = responsePayload.incognito;
    var pageUrl = responsePayload.pageUrl || null;  // 追加

    if (urls.length == 0) {
        alert("No Images Found");
        return;
    }

    var run = function(){
        var tabOptions = {
            url: model.runtime.getURL('images.html')  // 1-3 の修正も反映
        };

        model.tabs.create(tabOptions, function(tab) {
            // 追加：Referer 用にタブ ID と pageUrl を記録
            referrerInfo.tabId   = tab.id;
            referrerInfo.pageUrl = pageUrl;

            var key = "tab-" + tab.id;
            var handler = function(tabId){
                var fields = ['tabBackgroundColor', 'tabForegroundColor', 'ignoreThumbs'];
                model.storage.sync.get(fields, function(options) {
                    var payload = {
                        operation : "execute",
                        type      : "displayUrls",
                        urls      : urls,
                        options   : options
                    };
                    model.tabs.sendMessage(tabId, payload, function(response) {
                        //noop
                    });
                });
            };

            pendingTabs[key] = handler;
        });
    };

    if (incognito){
        var confirmMsg = "The images may be shown in a non-private window. Continue?";
        confirmDialog(tabId, confirmMsg, function(answer){
            if (!answer){ return; }
            run();
        });
        return;
    }

    run();
}
```

---

### 2-4. background.js：`urlsToTabbedWindow()` を修正

`pageUrl` を受け取り、ウィンドウ生成時に `referrerInfo` を更新する。

**変更点：**
1. `var pageUrl = payload.pageUrl || null;` を追加
2. `model.windows.create()` のコールバック内で `referrerInfo` を更新

```javascript
function urlsToTabbedWindow(tabId, payload){
    var urls = payload.imageUrls;
    var incognito = payload.incognito;
    var pageUrl = payload.pageUrl || null;  // 追加

    var run = function() {
        var windowOptions = {
            url: urls[0], incognito: incognito
        };
        model.windows.create(windowOptions, function(wnd) {
            // 追加：Referer 用に最初のタブの ID と pageUrl を記録
            if (wnd.tabs && wnd.tabs.length > 0) {
                referrerInfo.tabId   = wnd.tabs[0].id;
                referrerInfo.pageUrl = pageUrl;
            }

            for (var i = 1; i < urls.length; i++){
                var tabOptions = {
                    url      : urls[i],
                    windowId : wnd.id
                };
                model.tabs.create(tabOptions, function(tab) {
                    //noop
                });
            }
        });
    };

    if (urls.length == 0) {
        alert("No Images Found");
        return;
    } else if (urls.length > 10){
        var confirmMsg = "This action will open " + urls.length + " tabs, Continue?";
        confirmDialog(tabId, confirmMsg, function(answer){
            if (!answer){ return; }
            run();
        });
        return;
    }
    run();
}
```

---

## 修正サマリー

| ファイル | 修正内容 | 行数目安 |
|----------|----------|----------|
| manifest.json | permissions に webRequest, webRequestBlocking を追加 | 1行 |
| background.js | contextMenus.onclick → onClicked.addListener | 10行追加 |
| background.js | extension.getURL → runtime.getURL | 1行 |
| background.js | referrerInfo 変数・webRequest リスナー追加 | 30行追加 |
| background.js | urlsToSingleTab に pageUrl 受け取りと referrerInfo 更新を追加 | 3行追加 |
| background.js | urlsToTabbedWindow に pageUrl 受け取りと referrerInfo 更新を追加 | 5行追加 |
| img2tab.js | extension.inIncognitoContext にフォールバック追加（2カ所） | 2行 |
| img2tab.js | msg オブジェクトに pageUrl 追加（2カ所） | 2行 |

---

## 動作確認手順

修正後、以下の手順で動作確認すること。

1. `about:debugging` → 一時的なアドオンを読み込む → `manifest.json` を選択
2. 画像を含む任意のページで右クリック → img2tab メニューが表示されることを確認
3. 「Actual (seperate tabs)」「Actual (single tab)」「Linked (seperate tabs)」「Linked (single tab)」の4つが動作することを確認
4. Referer チェックを行うサイト（pixiv 等）で Linked メニューを実行し、画像が取得できることを確認
5. ブラウザの開発者ツール（ネットワークタブ）で Referer ヘッダーが付与されていることを確認

---

## 注意事項

- `wnd.windowId` は存在しない。正しくは `wnd.id` を使うこと（2-4 で反映済み）
- webRequest リスナーは Firefox では `extraHeaders` 不要。Chrome では必要。try-catch で自動判別している
- `referrerInfo.tabId` は上書き式のため、複数タブを連続で開いた場合は最後のタブのみ Referer が付与される。個人使用のため許容範囲とする

---

## 修正3：Pinterest 対応

Pinterest（jp.pinterest.com 等）のピン一覧ページで、サムネイル画像をフル解像度で開けるようにする。
動画ピンのサムネイル画像は一覧から除外する。

### 3-1. img2tab.js：`processUrls` に Pinterest URL 変換を追加

`i.pinimg.com` 配下の URL のサイズセグメント（例：`236x`, `474x`, `736x`, `75x75_RS` 等）を
`originals` に置換することでフル解像度を取得する。

**対象箇所：`processUrls()` 内の Instagram 高品質化ロジックの直後**

```javascript
// Pinterest: サイズセグメントを originals に置換してフル解像度を取得
if (url.match(/^https?:\/\/i\.pinimg\.com\//i)) {
    url = url.replace(
        /^(https?:\/\/i\.pinimg\.com\/)(\d+x\d*(?:_RS)?|originals)\//i,
        "$1originals/"
    );
}
```

---

### 3-2. img2tab.js：`srcset` 属性から最高解像度 URL を取得

Pinterest をはじめ多くのサイトでは `<img srcset="...">` で複数解像度を提供している。
`src` のみだと低解像度になるため、`srcset` から最大解像度の URL を選ぶ。

**追加するヘルパー関数（ファイル上部、`processUrls` の前あたりに追加）：**

```javascript
// srcset 属性から最高解像度の URL を返す。srcset が無ければ null。
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
            weight = (parseFloat(descriptor) || 1) * 10000;
        }
        if (weight > bestWeight) {
            bestWeight = weight;
            best = u;
        }
    }
    return best;
}
```

**`getImages()` 内の `<img>` 走査ループを変更：**

```javascript
// 修正前
for (var i = 0; i < images.length; i++){
    var url = images[i].src
    if (inArray(url, imageUrls) == -1){
        imageUrls.push(url);
    }
}

// 修正後（srcset 優先 + 動画ピン除外）
for (var i = 0; i < images.length; i++){
    // 動画ピンのサムネは除外（3-3 参照）
    if (isVideoPinThumb(images[i])) { continue; }

    // srcset があれば最高解像度を優先
    var srcsetUrl = getBestSrcsetUrl(images[i].getAttribute("srcset"));
    var url = srcsetUrl || images[i].src;
    if (!url) { continue; }
    if (inArray(url, imageUrls) == -1){
        imageUrls.push(url);
    }
}
```

---

### 3-3. img2tab.js：動画ピンサムネイル除外ヘルパー

Pinterest の動画ピンは `<img>`（サムネ）と `<video>` が同じピンコンテナ内に共存している。
`<img>` から先祖を 5 階層ほど遡り、その配下に `<video>` 要素や動画系の data 属性があれば
動画ピンと判定して除外する。

**追加するヘルパー関数（`getBestSrcsetUrl` の隣に追加）：**

```javascript
// img 要素が Pinterest の動画ピン内にあるかを判定する。
// Pinterest 以外のページでは常に false。
function isVideoPinThumb(imgElement) {
    if (!imgElement) { return false; }
    if (!/(^|\.)pinterest\./i.test(location.host)) { return false; }

    var node = imgElement.parentElement;
    for (var depth = 0; depth < 5 && node; depth++) {
        // 直下に video 要素が含まれていれば動画ピン
        if (node.querySelector) {
            if (node.querySelector("video")) { return true; }
            // Pinterest の動画ピンマーカー（data-test-id, aria-label など）
            if (node.querySelector('[data-test-id*="video" i]')) { return true; }
            if (node.querySelector('[aria-label*="video" i]'))   { return true; }
        }
        node = node.parentElement;
    }
    return false;
}
```

---

### 3-4. 動作確認手順（Pinterest）

1. `about:debugging` でアドオンを再読込
2. https://jp.pinterest.com にログイン状態でアクセス
3. 任意のボード／検索結果／ホームフィードでピンが並ぶ状態にする
4. 取り込みたい範囲まで手動でスクロールしてピンを DOM に乗せる
5. 何もないところで右クリック → img2tab → **Actual (seperate tabs)** または **Actual (single tab)**
6. 開いた画像 URL が `https://i.pinimg.com/originals/...` になっていることを確認
7. 動画ピンのサムネが一覧に含まれていないことを確認
8. DevTools の Network タブで Referer ヘッダーが付与されていることを確認

---

## Pinterest 対応の制約

- **遅延読み込み（仮想スクロール）**：DOM に存在するピンしか取れないため、事前にスクロールが必要
- **`/pin/{id}/` 形式のリンク**：Linked モードでは取得不可（拡張子で終わらないため）。Actual モードを使う
- **動画ピン本体（.m3u8 / .mp4）**：対象外（`<img>` のみ走査するため自動的に除外される）
- **動画ピンのサムネ画像**：3-3 のヘルパーで除外

---

## 修正4：メニュー整理

実利用で「separate tabs」モード（画像ごとに別タブを開く）を使わないため、
右クリックメニューを単一タブモードのみに整理し、表記も日本語化する。

### 4-1. メニュー構成の変更

**現在（修正1〜3 適用後）：**
```
img2tab
├─ Actual (seperate tabs)
├─ Actual (single tab)
├─ Linked (seperate tabs)
└─ Linked (single tab)
```

**変更後：**
```
img2tab
├─ 画像を一つのtabで表示
└─ リンク画像を一つのtabで表示
```

---

### 4-2. background.js：メニュー定義と onClicked リスナーの変更

**現在：**
```javascript
model.contextMenus.create({"id": "actual-separate", "title": "Actual (seperate tabs)", "parentId": id, "contexts": contexts});
model.contextMenus.create({"id": "actual-single",   "title": "Actual (single tab)",    "parentId": id, "contexts": contexts});
model.contextMenus.create({"id": "linked-separate", "title": "Linked (seperate tabs)", "parentId": id, "contexts": contexts});
model.contextMenus.create({"id": "linked-single",   "title": "Linked (single tab)",    "parentId": id, "contexts": contexts});

model.contextMenus.onClicked.addListener(function(info, tab) {
    switch (info.menuItemId) {
        case "actual-separate": onExplodeImagesClick(info, tab);             break;
        case "actual-single":   onExplodeImagesSingleClick(info, tab);       break;
        case "linked-separate": onExplodeLinkedImagesClick(info, tab);       break;
        case "linked-single":   onExplodeLinkedImagesSingleClick(info, tab); break;
    }
});
```

**変更後：**
```javascript
model.contextMenus.create({"id": "actual-single", "title": "画像を一つのtabで表示",    "parentId": id, "contexts": contexts});
model.contextMenus.create({"id": "linked-single", "title": "リンク画像を一つのtabで表示", "parentId": id, "contexts": contexts});

model.contextMenus.onClicked.addListener(function(info, tab) {
    switch (info.menuItemId) {
        case "actual-single": onExplodeImagesSingleClick(info, tab);       break;
        case "linked-single": onExplodeLinkedImagesSingleClick(info, tab); break;
    }
});
```

---

### 4-3. background.js：不要関数の削除

以下の関数は呼び出し元が消えるため削除する。

| 関数名 | 用途（削除前） |
|---|---|
| `onExplodeImagesClick` | Actual (seperate tabs) ハンドラ |
| `onExplodeLinkedImagesClick` | Linked (seperate tabs) ハンドラ |
| `urlsToTabbedWindow` | 上記2関数からのみ呼ばれる、新ウィンドウ＋複数タブ生成処理 |

→ background.js から合計 **約 50 行削減**。

---

### 4-4. 動作確認手順（メニュー整理）

1. `about:debugging` でアドオンを再読込
2. 任意の画像があるページで右クリック → img2tab メニューを開く
3. メニュー項目が **「画像を一つのtabで表示」** と **「リンク画像を一つのtabで表示」** の **2つだけ** になっていることを確認
4. それぞれをクリックして従来の「single tab」相当の動作になることを確認

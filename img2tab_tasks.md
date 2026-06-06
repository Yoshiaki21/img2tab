# img2tab 作業指示書（tasks.md）

<!-- 完了したタスクは別途 tasks_done.md 等へ移動する運用を想定 -->
<!-- 記述スタイルは img2tab_modification_spec.md に準拠（before/after を明示） -->

---

## 修正5: ギャラリー画像を save-in に「クリック保存」連携

### 概要
img2tab のギャラリー（`images.html` / `view.js`）に並んだ画像を、**修飾キー + クリック**で
別拡張 **save-in** に渡し、save-in のルーティング/保存パイプラインで保存できるようにする。

### 背景（なぜこの方式か）
- save-in 単体の「クリックして保存（Click to Save）」は、対象ページにコンテンツスクリプトを
  注入して click を検知する仕組み。
- しかし `images.html` は img2tab 自身の `moz-extension://` 特権ページであり、
  save-in の `content_scripts`（`matches: ["<all_urls>"]`）は **注入されない**
  （Firefox は他拡張ページへのコンテンツスクリプト注入を禁止）。
- よって save-in 側をいくら直しても不可。**save-in が公開している外部メッセージAPI
  （`runtime.onMessageExternal`）へ img2tab 側から直接 `DOWNLOAD` を送る**のが正攻法。
  save-in の `messaging.js` 内 Foxy Gestures 連携と同じ仕組み。

### 対象ファイル
```
img2tab/
├── view.js        ← 修正あり（コード追加のみ）
└── manifest.json  ← 修正なし（権限追加・externally_connectable とも不要）
```

### 前提条件
- save-in がインストール済みかつ有効であること。
- 送信先は save-in の拡張ID `{b6fcb779-b817-4c30-8e82-0a316c9c40b5}`
  （save-in の `manifest.json` → `browser_specific_settings.gecko.id`）。
  save-in 側を再ビルド/再署名して ID が変わった場合は、この値を更新すること。

---

### 5-1. view.js：save-in 連携ブロックを追加

`view.js` の**末尾**に以下を追加する。既存コードの変更は不要（追加のみ）。
`model`（`chrome` or `browser`）は view.js 冒頭で定義済みのものを流用する。

```javascript
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
```

---

### 5-2. 動作確認手順
1. save-in を `about:debugging` で読み込み、有効化しておく。必要なら save-in の保存先/
   ルーティング（`comment` = `img2tab` を特定フォルダに振り分ける等）を設定する。
2. img2tab を `about:debugging` → 一時的なアドオンを読み込む → `manifest.json` で読込（再読込）。
3. 画像のあるページで右クリック → img2tab →「画像を一つのtabで表示」でギャラリー(`images.html`)を開く。
4. ギャラリー上の画像を **Alt + 左クリック**（`SAVE_MODIFIER` 変更時はその修飾キー）する。
5. クリックした画像に緑の枠が一瞬出て、save-in 側が保存（通知が出る場合あり）することを確認。
6. save-in 未導入状態でも試し、alert で正しくエラー表示されることを確認。

### 注意事項
- **manifest は変更しない**（権限追加・`externally_connectable` とも不要。MY_CLAUDE 系の
  「permissions 変更禁止」方針にも合致）。
- ギャラリー内で `<iframe>` 描画される項目（gifv / gfycat 等）は本連携の対象外。
  `<img>` で描画される画像（jpg/png/gif/webm 等）のみが対象。
- `pageUrl` には画像URL自体を入れている（このページは moz-extension:// で元ページURLを
  保持していないため）。フォルダ振り分けは `srcUrl`（=画像URL）の `:sourcedomain:` や
  `comment` を使って save-in 側ルールで行う想定。
- save-in を再署名して拡張IDが変わった場合は `SAVE_IN_ID` の更新が必要。
- Alt がWMと競合する環境（Linux KDE/GNOME 等）では `SAVE_MODIFIER` を `"ctrl"` 等へ変更する。

---

## Claude Codeへの指示文（例）

```
img2tab リポジトリの tasks.md（修正5）を実装してください。
- 変更は view.js への追加のみ。manifest.json は変更しないこと。
- 既存コードのスタイル（var / callback / CRLF）に合わせること。
- 実装後、エディタ上の構文エラーが無いことを確認。
- 実機での Alt+クリック動作確認は人間が about:debugging で行うため、
  確認手順（tasks.md 5-2）を最後に提示してください。
```

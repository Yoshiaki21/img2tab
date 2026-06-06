#!/bin/bash

# manifest.jsonからname・versionを取得
ADDON_NAME=$(cat manifest.json | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['name'])")
VERSION=$(cat manifest.json | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['version'])")
ID=$(cat manifest.json | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['browser_specific_settings']['gecko']['id'])")

ADDONS_DIR="/home/yoshiaki/GitHub_data/firefox-addons"
DEPLOY_DIR="${ADDONS_DIR}/${ADDON_NAME}"

README="${ADDONS_DIR}/README.md"
XPI_NAME="${ADDON_NAME}-${VERSION}.xpi"

echo "署名開始: ${ADDON_NAME} v${VERSION}"

# 署名実行
SIGNER_DIR=/home/yoshiaki/GitHub_data/web-ext-signer
EXT_DIR=$(pwd)

podman run --rm \
  -v "${EXT_DIR}:/work:Z" \
  --env-file "${SIGNER_DIR}/.env" \
  registry.gskraft.com/web-ext-signer:latest

# 署名済みxpiを探してリネーム＆コピー
SIGNED_XPI=$(ls artifacts/*.xpi 2>/dev/null | head -1)

if [ -z "$SIGNED_XPI" ]; then
  echo "エラー: xpiが見つかりません"
  exit 1
fi

echo "リネーム: $(basename $SIGNED_XPI) → ${XPI_NAME}"
cp "$SIGNED_XPI" "${DEPLOY_DIR}/${XPI_NAME}"

# 署名ファイルを削除
rm -rf artifacts

# updates.jsonを更新
cat > "${DEPLOY_DIR}/updates.json" << EOF
{
  "addons": {
    "${ID}": {
      "updates": [
        {
          "version": "${VERSION}",
          "update_link": "https://github.com/Yoshiaki21/firefox-addons/blob/main/${ADDON_NAME}/${XPI_NAME}"
        }
      ]
    }
  }
}
EOF

echo "updates.json 更新済み"

# README.mdの該当行を更新（"- [img2tab" または "- [save-in" で始まる行を置換）
sed -i "s|- \[${ADDON_NAME}.*|- [${ADDON_NAME} v${VERSION}](${ADDON_NAME}/${XPI_NAME})|" "${README}"

echo "README.md 更新済み"

# firefox-addonsリポジトリへ移動してgit push
cd "${ADDONS_DIR}" || { echo "エラー: ${ADDONS_DIR} に移動できません"; exit 1; }

echo "git push開始..."

git add .
git commit -m "deploy: ${ADDON_NAME} v${VERSION}"
git push

if [ $? -eq 0 ]; then
  echo "✅ 完了: ${ADDON_NAME} v${VERSION} をデプロイしました"
else
  echo "❌ git pushに失敗しました"
  exit 1
fi

# shadowverseNEO

オンライン対戦のブラウザカードゲームです。

## ディレクトリ構成

- `server.js`: 起動用のエントリーポイント
- `src/gameServer.js`: Socket.IO とゲームロジック
- `src/gameData.js`: カード定義とデッキ生成
- `public/index.html`: 画面レイアウト
- `public/css/styles.css`: UI スタイル
- `public/js/app.js`: クライアント処理と描画

## 変更意図

- カードの内容やバランス調整は `src/gameData.js` で集中管理
- サーバー側の処理は `src/gameServer.js` に分離
- 表示や見た目は `public/css/styles.css` へ分離
- フロントエンドの動作は `public/js/app.js` へ分離

これにより、各項目を独立して編集しやすくなっています。

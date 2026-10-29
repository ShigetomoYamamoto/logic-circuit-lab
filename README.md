# さわって学ぶ論理回路

スイッチをタップしながら、論理ゲート（WIRE・NOT・AND・OR・XOR・NAND・NOR）のしくみを学ぶ、スマートフォン向けの学習ページです。HTML・CSS・JavaScript だけで作られていて、ビルドも外部通信も不要です。各ゲートで、真理値表、ゲートの中身（スイッチの回路、XOR は他のゲートの組み合わせ）、出力を当てる予想クイズを試せます。

## 開き方

- GitHub Pages: https://shigetomoyamamoto.github.io/logic-circuit-lab/ （公開後の URL の仮置きです）
- ローカル: `index.html` をブラウザで開くだけで動きます（サーバー不要）。

## 章の一覧

| 章 | 内容 | 状態 |
|---|---|---|
| 第1章 | ゲート編（はじめに、WIRE、NOT、AND、OR、XOR、NAND、NOR、まとめ） | 公開中 |
| 第2章 | 計算編 | 準備中 |
| 第3章 | 記憶編 | 準備中 |
| 第4章 | CPU編 | 準備中 |

## ファイル構成

- `index.html` / `style.css` / `app.js` : 画面
- `logic.js` : ゲートの論理（画面に依存しない。ブラウザと Node の両方で動く）
- `tests/logic.test.js` : 論理のテスト
- `tests/e2e.js` : ブラウザ操作のテスト（Playwright）

## テストの実行

```
node tests/logic.test.js   # 論理のテスト（依存なし）
node tests/e2e.js          # 画面のテスト（Playwright が必要）
```

`tests/e2e.js` は Playwright（`playwright` または `playwright-core`）と Chromium 系ブラウザを使います。Playwright 同梱のブラウザがない場合は、`CHROME_PATH` に Chrome / Chromium の場所を指定できます。スクリーンショットは `/tmp/logic-lab-shots/` に保存されます。

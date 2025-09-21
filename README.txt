# MI Prop v5（レトロ時限爆弾スキン＋長尺ログ）
- 固定 7:3（左スクリーン/右テンキー）、上下左右 2cm 余白、中央 1cm スリット。
- レトロ/古びた質感：金属ベゼル、ビス、CRT風スキャンライン、ノイズ重ね（`assets/overlay_vintage.jpg`）。
- ログ演出：英語コマンド＋乱数文字列を**約3秒延長**、オートスクロール、折り返し表示。
- 置換ポイント：
  - 背景：`assets/background.jpg` を差し替え
  - 正解コード：`app.js` の `CORRECT`
  - 速度・長さ：`EXTRA_DRAMA_TIME`, `DRAMA_MIN/MAX`, `ASCII_LINES_BASE`
  - 効果音：`audio/beep.mp3`, `audio/error.mp3`

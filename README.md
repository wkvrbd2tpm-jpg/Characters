# キャラクター図鑑

キャラクター紹介サイトです。GitHub Pages でそのまま公開できます。

## 公開のしかた(はじめの1回だけ)

1. GitHub にログインし、右上の「+」→「New repository」を選びます。
2. Repository name に好きな名前(例: `characters`)を入れ、**Public** にして「Create repository」。
3. 作成後の画面で「uploading an existing file」のリンクを押し、このフォルダの**中身すべて**(`index.html`、`admin.html`、`data`、`images` など)をドラッグして「Commit changes」。
   - フォルダごとではなく、中身を入れてください。`data` と `images` もフォルダごと入れて大丈夫です。
4. リポジトリの「Settings」→「Pages」を開き、Source を「Deploy from a branch」、Branch を `main` / `/ (root)` にして Save。
5. 1〜2分待つと、`https://ユーザー名.github.io/リポジトリ名/` で公開されます。

## ページからキャラクターを追加できるようにする

追加用のページは `https://ユーザー名.github.io/リポジトリ名/admin.html` です。使うには、自分専用のトークンを作ります。

1. GitHub 右上のアイコン → Settings → 一番下の「Developer settings」→「Personal access tokens」→「Fine-grained tokens」→「Generate new token」。
2. Token name は何でもOK。Expiration は好きな期間(最長1年)。
3. 「Repository access」で「Only select repositories」を選び、このサイトのリポジトリだけを選びます。
4. 「Permissions」→「Repository permissions」→ **Contents** を **Read and write** にします。
5. 「Generate token」を押し、表示された文字列をコピーします(もう一度は表示されません)。
6. `admin.html` を開き、「GitHub との接続」にユーザー名・リポジトリ名・トークンを入れて「接続して読み込む」。

あとはフォームに入力して「保存して公開」を押すだけです。1〜2分でサイトに反映されます。

- トークンは、そのブラウザの中にだけ保存されます。共有パソコンでは使わないでください。
- 他の人が `admin.html` を開いても、トークンがなければ何もできません。
- トークンが漏れたと思ったら、同じ画面から Revoke(無効化)できます。

## ファイルの構成

- `index.html` / `style.css` / `app.js` … 公開ページ
- `admin.html` / `admin.js` … 追加・編集・削除用ページ
- `data/characters.json` … キャラクターのデータ
- `images/` … 画像(追加すると自動で軽量化されて入ります)

## 掲載について

掲載するキャラクターは成人(18歳以上)の設定のものに限ります。追加フォームにも確認のチェック欄があります。

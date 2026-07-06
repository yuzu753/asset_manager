# Asset Manager Web

Supabase の無料Postgresをデータストアとして使い、CSVの初期取り込み後はWebアプリから金融商品と日次評価額を読み書きする Next.js アプリです。  
アプリ本体は `web/` ディレクトリにあります。

## 使い方

1. Supabaseで無料プロジェクトを作成します。
2. SupabaseのSQL Editorで [supabase/schema.sql](supabase/schema.sql) の内容を実行します。

   内容は以下です。

   ```sql
   create table if not exists products (
     product_id text primary key,
     name text not null unique,
     category text not null default 'Uncategorized',
     currency text not null default 'JPY',
     active boolean not null default true,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now()
   );

   create table if not exists valuations (
     date date not null,
     product_id text not null references products(product_id) on delete cascade,
     amount numeric not null,
     note text not null default '',
     updated_at timestamptz not null default now(),
     primary key (date, product_id)
   );
   ```

3. `web/.env.local.example` を参考に `web/.env.local` を作成します。

   ```bash
   SUPABASE_URL=https://xxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=Supabaseのservice_roleキー
   APP_PASSWORD=自分だけが知っているアプリ用パスワード
   ```

4. 依存関係をインストールします。

   ```bash
   cd web
   npm install
   ```

5. 開発サーバーを起動します。

   ```bash
   npm run dev
   ```

6. ブラウザで `http://localhost:3000` を開き、`APP_PASSWORD` を入力して接続します。

## デプロイ

VercelなどのNext.js対応ホスティングに `web/` をデプロイし、以下の環境変数を設定します。

Vercel の Project Settings > Build and Deployment では、Root Directory を `web` に設定してください。
`web/package.json` に Next.js の依存関係があるため、Root Directory が `./` のままだと
`No Next.js version detected` が出ることがあります。

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_PASSWORD`

`SUPABASE_SERVICE_ROLE_KEY` はサーバー側だけで使う秘密情報です。ブラウザには渡さず、Gitにもコミットしないでください。

## CSV のフォーマット

- 1列目は日付です。
- 日付は `YYYY/MM/DD` 形式です。
- 2列目以降は金融商品名です。
- 各セルの値は評価額です。カンマや通貨記号付きでも取り込めます。

例:

```csv
date,現金,証券口座,投資信託
2026/01/31,100000,250000,300000
2026/02/28,120000,260000,310000
```

## 主な機能

- CSVの初期取り込み
- Supabaseからの読み込み
- 金融商品の追加・編集
- 日次評価額の入力と保存
- 同じ日付・同じ金融商品の評価額は上書き
- 入力履歴の閲覧
- 期間指定、並び替え、カテゴリ別/資産別集計
- 総評価額の推移チャート

## 補足

- Google Sheets APIやサービスアカウントの秘密鍵は使いません。
- 評価額がない商品は、過去に入力された直近の評価額を日別表示に引き継ぎます。
- 本人だけが使う前提の簡易保護として `APP_PASSWORD` を使います。
- 誤って空列や合計列を取り込んだ場合は、SupabaseのSQL Editorで [supabase/cleanup_bad_import.sql](supabase/cleanup_bad_import.sql) を実行してください。

# [Next.js Hakoniwa](https://hs.ddu.jp)

[Next.js](https://nextjs.org) で実装された箱庭諸島のWebアプリケーションです。

## Production / Docker

### 0. mise で開発ツールのバージョンを揃える

このリポジトリは `mise.toml` で Node.js / npm バージョンを管理します。

```bash
mise install
```

### 1. 依存パッケージのインストール

```bash
npm install
```

### 2. 本番・検証環境の対話式設定

依存パッケージをインストールしたリポジトリのdirectoryで、対話端末から実行します。

```bash
npm run setup
```

画面の案内に従い、最初にターン更新cronとマップサイズを決め、その後に災害、怪獣、火災、資源、URL、DB、認証設定を確認します。

- Enter: 現在値を維持
- 値を入力: 設定を変更
- `undo` または `u`: 1つ前の項目へ戻る
- Ctrl+C: ファイルを変更せず中止

初回構築ではDB passwordとPasskey pepperを安全な乱数で生成します。既存環境で再実行した場合は、既存DB password、Passkey pepper、Moderator初期bootstrap passwordを変更しません。secretの値は確認画面や差分へ表示されません。

確定すると、公開可能なゲーム設定を `.env.production`、環境固有値とsecretを `.env.production.local` へ保存します。既存ファイルは書き換え前に `.setup-backups/` へbackupされます。

> [!IMPORTANT]
> `npm run setup` は対話式TTY専用です。build、DB migration、deployは自動実行しません。設定保存後に表示される環境別の1ライナーを実行して反映してください。

標準Compose（MySQL + app + bundled Nginx）では次の形式のコマンドを実行します。

```bash
docker compose --env-file .env.production.local build app && docker compose --env-file .env.production.local up -d && docker compose --env-file .env.production.local ps
```

外部reverse proxyを使用する場合は `up -d app` で `web` を起動しない構成も選べます。setup完了時に、現在のリポジトリdirectoryに対応した両方の1ライナーが表示されます。`app` 起動時にはDB migrationが実行されます。

設定ファイルの役割や全項目の詳細は [環境変数一覧](./docs/environment_variables.md) を参照してください。

## Local development

### 1. 開発環境の環境変数設定

ローカル開発では `.env.example` を参考に、必要な開発用環境変数を設定します。実環境用secretを `.env.example` やGit管理対象ファイルへ保存しないでください。
詳細については [環境変数一覧](./docs/environment_variables.md) を参照してください。

### 2. SQLite開発DBの初期化

```bash
npm run db:init
```

### 3. Git Hookの設定（任意）

```bash
npm run lefthook
```

### 4. 開発サーバーの起動

```bash
npm run dev
```

## コマンド一覧

| コマンド               | 説明                                                  |
| ---------------------- | ----------------------------------------------------- |
| `npm run dev`          | 開発サーバーの起動                                    |
| `npm run build`        | 通常の本番ビルド                                      |
| `npm run build:mini`   | 2CPU/2GB環境想定のビルド                              |
| `npm run build:docker` | ホスト側のビルドが難しい場合は、Docker 内でビルド実行 |
| `npm run setup`        | 本番・検証環境の初期設定または安全な再設定            |
| `npm run start`        | 本番サーバーの起動                                    |
| `npm run test`         | ユニットテストの実行                                  |
| `npm run lint`         | ESLint / Stylelint / TypeScript の静的解析            |
| `npm run lefthook`     | Git Hook（pre-commit）のインストール                  |
| `npm run fmt`          | Prettier によるフォーマット                           |
| `npm run storybook`    | Storybook の起動（コンポーネントのカタログ）          |
| `npm run turn`         | ターン処理の手動実行                                  |

### データベース操作

| コマンド              | 説明                                  |
| --------------------- | ------------------------------------- |
| `npm run db:init`     | マイグレーション実行 + 型生成（初回） |
| `npm run db:migrate`  | 未適用マイグレーションの適用 + 型生成 |
| `npm run db:rollback` | 直前の1ステップをロールバック         |
| `npm run db:codegen`  | 型定義の再生成のみ                    |

## 開発サーバーの起動

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) をブラウザで開くと結果を確認できます。

### コンポーネントカタログ（Storybook）

```bash
npm run storybook
```

[http://localhost:6006](http://localhost:6006) をブラウザで開くと確認できます。

## Docker検証環境の起動

Passkey（WebAuthn）を用いた認証や、自己署名証明書によるHTTPS通信などのテストを行うには、本番相当のコンテナ環境を使用します。

先に `npm run setup` を実行し、完了時に表示された1ライナーでbuild・起動してください。手動で実行する場合は、現在のCompose仕様に合わせてlocal env fileを明示します。

```bash
docker compose --env-file .env.production.local build app && docker compose --env-file .env.production.local up -d && docker compose --env-file .env.production.local ps
```

Origin URLなどの詳細は [Docker検証環境手順](./docs/docker_verification.md) を参照してください。

## Dockerでビルドのみ実行する

Amazon Linux などでホスト側のビルドが難しい場合は、Docker 内でビルドだけを実行できます。Compose の一時コンテナとして実行するため、シェルスクリプト依存なしで使えます。

```bash
npm run build:docker
```

## ドキュメント

| ドキュメント                                                 | 説明                                            |
| ------------------------------------------------------------ | ----------------------------------------------- |
| [認証仕様](./docs/auth_specification.md)                     | JWT・パスキー・アカウントロックアウトの仕様     |
| [データベースマイグレーション](./docs/database_migration.md) | マイグレーションの仕組みと操作手順              |
| [データベース仕様](./docs/database_specification.md)         | データベースのテーブル定義とリレーションシップ  |
| [環境変数一覧](./docs/environment_variables.md)              | 全環境変数の説明とデフォルト値                  |
| [ターン処理仕様](./docs/turn_process_specification.md)       | ターン処理の実行順序とシーケンス図              |
| [ターンログ仕様](./docs/turn_log_specification.md)           | ターンログのカスタムタグ仕様                    |
| [Define追加ガイド](./docs/define/README.md)                  | plan/map/log/achievement 定義の追加手順と注意点 |
| [Docker検証環境手順](./docs/docker_verification.md)          | 本番相当環境（Nginx+MySQL）でのローカル検証手順 |

## 依存ライブラリ (主要)

| ライブラリ      | バージョン |
| --------------- | ---------- |
| Node.js         | 24.14.1    |
| TypeScript      | 6.0.3      |
| React           | 19.2.8     |
| Next.js         | 16.2.11    |
| Tailwind CSS    | 4.3.0      |
| kysely          | 0.29.4     |
| better-sqlite3  | 12.11.1    |
| mysql2          | 3.23.1     |
| sass            | 1.102.0    |
| zod             | 4.4.3      |
| argon2          | 0.45.1     |
| simpleWebAuthn  | 13.3.0     |
| zustand         | 5.0.14     |
| react-virtuoso  | 4.18.11    |
| react-hook-form | 7.76.0     |
| jsonwebtoken    | 9.0.3      |
| winston         | 3.19.0     |

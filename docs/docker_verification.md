# Docker検証環境

標準Composeは、MySQL、Next.js app、bundled Nginxをまとめて起動できます。PasskeyなどHTTPSとOriginの一致が必要な機能を、ローカルまたは検証環境で確認するための構成です。

## 構成

- `mysql`: MySQL 8.0。host側portは `MYSQL_HOST_PORT` で設定します。
- `app`: Next.js。起動時にDB migrationを実行します。
- `web`: HTTPS対応のbundled Nginx。`app` へreverse proxyします。

外部Nginxなどを使用する環境では、`web` を起動せず `app` だけを起動できます。

## 1. 依存パッケージ

```bash
npm install
```

## 2. 対話式設定

repository rootの対話端末で実行します。

```bash
npm run setup
```

公開可能なゲーム設定は `.env.production`、環境固有値とsecretはGit管理外の `.env.production.local` に保存されます。setupは新規環境のDB credentialを生成し、再setupでは既存credentialを維持します。

主なDocker用設定:

- `MYSQL_HOST_PORT`: hostへ公開するMySQL port。初期候補は `13306`。
- `DB_CONNECTION_STRING`: host側のsetup・診断用URL。
- `DOCKER_DB_CONNECTION_STRING`: appから `mysql:3306` へ接続するURL。
- `NEXT_PUBLIC_ORIGIN_URL`: ブラウザからアクセスするOrigin。
- `DOCKER_NEXT_PUBLIC_ORIGIN_URL`: app runtime用Origin。通常は上記と同じ値。
- `NEXT_PUBLIC_RP_ID`: PasskeyのRP ID。

同一hostで複数環境を起動する場合は、環境ごとに異なるCompose project名、container名、公開port、volumeを使用してください。

## 3. bundled Nginx用証明書

標準の `web` serviceは `.certs/localhost.crt` と `.certs/localhost.key` を使用します。初回に自己署名証明書を作成します。

```bash
mkdir -p .certs && openssl req -x509 -nodes -days 365 -newkey rsa:2048 -keyout .certs/localhost.key -out .certs/localhost.crt -subj "/CN=localhost"
```

自己署名証明書のため、ブラウザでは警告を確認したうえで検証用サイトへ進んでください。任意ドメインの証明書やCertbotはsetupの対象外です。

## 4. buildと起動

### 標準Compose（MySQL + app + bundled Nginx）

```bash
docker compose --env-file .env.production.local build app && docker compose --env-file .env.production.local up -d && docker compose --env-file .env.production.local ps
```

### 外部reverse proxy（MySQL + app）

```bash
docker compose --env-file .env.production.local build app && docker compose --env-file .env.production.local up -d app && docker compose --env-file .env.production.local ps
```

setupの保存完了時にも、実際のrepository pathを含む両方の1ライナーが表示されます。setup自体はbuildや起動を行いません。

## 5. 確認と操作

標準Composeでは設定したOriginへアクセスします。初期のlocalhost構成なら `https://localhost` です。Passkey検証ではブラウザのURL、`NEXT_PUBLIC_ORIGIN_URL`、`NEXT_PUBLIC_RP_ID` の整合を確認してください。公開値を変更した場合は再buildが必要です。

既存コンテナの通常操作はbare Composeコマンドでも行えます。

```bash
docker compose ps
docker compose logs app
docker compose restart app
```

host側DBクライアントから接続する場合は `.env.production.local` の `DB_CONNECTION_STRING` を使用します。passwordをコマンド履歴やログへ直接出力しないでください。

## トラブルシューティング

- buildでOrigin/RP ID不足が表示される: `npm run setup` を完了し、`--env-file .env.production.local` 付きのbuildコマンドを使用します。
- Passkeyエラー: ブラウザのOrigin、`NEXT_PUBLIC_ORIGIN_URL`、`NEXT_PUBLIC_RP_ID` を確認して再buildします。
- app起動失敗: `docker compose logs app` でmigration・DB接続エラーを確認します。
- MySQL port競合: setupを再実行し、未使用の `MYSQL_HOST_PORT` を選択します。

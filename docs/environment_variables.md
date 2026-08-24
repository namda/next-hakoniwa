# 環境変数一覧

このドキュメントでは、プロジェクト内で使用するすべての環境変数を説明します。

> [!NOTE]
> `NEXT_PUBLIC_` プレフィックスが付いた変数はクライアント（ブラウザ）でも参照できます。
> それ以外の変数はサーバーサイドでのみ利用可能です。

## 設定ファイルについて

本番設定は次の役割に分離します。

- `.env.example`: Git管理するサンプルと初期候補（runtimeの現在値ではない）
- `.env.production`: Git管理するゲームバランス・共通公開設定
- `.env.production.local`: Git管理しない環境固有値・DB・secret

対話端末で `npm run setup` を実行すると、新規設定または安全な再設定ができます。
非TTY stdinは拒否し、キャンセル時は何も書きません。再設定ではDB password、Passkey
pepper、Moderator initial bootstrap passwordを維持し、確定後の更新前に
`.setup-backups/` へowner-onlyの一意なbackupを作成します。setupはbuildやdeployを行いません。

このプロジェクトは [`dotenv-flow`](https://github.com/kerimdzhanov/dotenv-flow) を使用しています。
`NODE_ENV` の値に応じて以下の順番でファイルを読み込みます（後で読まれたものが優先）。

```text
.env → .env.local → .env.{NODE_ENV} → .env.{NODE_ENV}.local
```

本番環境の機密情報は `.env.production.local` に記載し、**バージョン管理には含めないでください**。

実行前から `process.env` に存在するshell/Compose値はenvファイルより優先され得ますが、
setupは偶然存在するshell値を永続化しません。`NEXT_PUBLIC_*` はブラウザへ公開され得るため
secretを置けません。Docker buildには環境固有の公開値（originとRP ID）だけをallowlistで渡し、
`.env.production.local` 全体はbuild contextとbuild processの双方から除外します。

`DB_CONNECTION_STRING` はhost側setup/診断用で、利用する環境の公開MySQL portを指定します。
`DOCKER_DB_CONNECTION_STRING` はCompose内の `mysql:3306` 用です。同じ資格情報から導出します。

ターン速度の正本は `NEXT_PUBLIC_TURN_CRON` のみです。turn/dayと名目平均間隔は設定timezoneで
Cronerの実発火から算出し、別のenvへ保存しません。global event rateは新規島のbaselineであり、
既存島の `event_rate` はゲーム状態なのでsetupでは上書きしません。自然怪獣は
`event_rate.monster` ではなくglobal怪獣式、油田枯渇はglobal rateを使用します。既存島がある
環境ではmap sizeを変更できません。怪獣のday表示は確率式上の期待値で、実観測匹数ではありません。

---

## アプリケーション設定

| 変数名                     | 例                       | 説明                                                     |
| -------------------------- | ------------------------ | -------------------------------------------------------- |
| `NEXT_PUBLIC_TITLE`        | `箱庭諸島`               | サイトのタイトル                                         |
| `NEXT_PUBLIC_VERSION`      | `0.0.0`                  | アプリケーションのバージョン                             |
| `NEXT_PUBLIC_ORIGIN_URL`   | `http://localhost:3000/` | サイトのオリジンURL（Passkey の RP ID 等でも参照される） |
| `NEXT_PUBLIC_NEGLECT_DAYS` | `30`                     | 放置すると自動的に島が無人化になる日数。                 |

---

## データベース設定

| 変数名                        | 例                                               | 説明                                                      |
| ----------------------------- | ------------------------------------------------ | --------------------------------------------------------- |
| `DB_TYPE`                     | `sqlite` / `mysql`                               | 使用するDBの種別。production setupでは `mysql`            |
| `MYSQL_DATABASE`              | `hakoniwa`                                       | MySQL database名                                          |
| `MYSQL_USER`                  | `hakoniwa_user`                                  | MySQL application user                                    |
| `MYSQL_PASSWORD`              | _(ランダムな文字列)_                             | MySQL application password。`.env.production.local`に保存 |
| `MYSQL_ROOT_PASSWORD`         | _(別のランダムな文字列)_                         | MySQL root password。`.env.production.local`に保存        |
| `MYSQL_HOST_PORT`             | `13306`                                          | hostへ公開するMySQL port。Composeとhost側URLで共通使用    |
| `DB_CONNECTION_STRING`        | `mysql://user:password@127.0.0.1:13306/hakoniwa` | host側setup・診断用URL。portは環境に合わせる              |
| `DOCKER_DB_CONNECTION_STRING` | `mysql://user:password@mysql:3306/hakoniwa`      | app containerからMySQL serviceへ接続するURL               |

> [!IMPORTANT]
> `DB_TYPE=mysql` の場合、MySQL 5.7 以上が必要です。

DB、Passkey、Moderator、Origin等はsetupで管理します。S3詳細、火災規模weight・damage rate、その他の細かな値はこの一覧を参照してenvファイルで手動設定します。再setupはsetup対象外の既存値を削除・上書きしません。

---

## Passkey 設定

| 変数名                     | 例                   | 説明                                                                                                   |
| -------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_RP_NAME`      | `箱庭諸島`           | WebAuthn の Relying Party 名（ブラウザの認証ダイアログに表示される）                                   |
| `NEXT_PUBLIC_RP_ID`        | `localhost`          | WebAuthn の Relying Party ID。本番ではドメイン名（例: `example.com`）を設定する                        |
| `NEXT_PUBLIC_MAX_PASSKEYS` | `5`                  | ユーザーが登録できるPasskeyの最大数                                                                    |
| `PASSKEY_FP_PEPPER`        | _(ランダムな文字列)_ | フィンガープリントのハッシュ化に用いるペッパー。**変更するとすべてのフィンガープリントが無効化される** |

> [!CAUTION]
> `PASSKEY_FP_PEPPER` は環境ごとに異なるランダムな文字列を設定し、外部に漏らさないでください。

---

## ターン進行設定

| 変数名                      | 例                         | 説明                                               |
| --------------------------- | -------------------------- | -------------------------------------------------- |
| `NEXT_PUBLIC_TURN_CRON`     | `"0 0,4,8,12,16,20 * * *"` | ターンを自動実行するcronスケジュール（croner形式） |
| `NEXT_PUBLIC_TURN_TIMEZONE` | `"Asia/Tokyo"`             | ターンスケジュールのタイムゾーン                   |

---

## ログ出力設定（サーバーサイドのみ）

| 変数名                     | 例                          | 説明                                                      |
| -------------------------- | --------------------------- | --------------------------------------------------------- |
| `LOG_BASE_DIR`             | `log`                       | ローカルファイル出力時の保存先ディレクトリ                |
| `LOG_TRANSPORT_MODE`       | `file` / `s3`               | ログの出力方式。`s3` はS3互換ストレージへの保存           |
| `LOG_S3_BUCKET`            | `my-logs`                   | S3互換ストレージのバケット名                              |
| `LOG_S3_REGION`            | `us-east-1`                 | S3互換ストレージのリージョン                              |
| `LOG_S3_ENDPOINT`          | `https://minio.example.com` | S3互換APIエンドポイント                                   |
| `LOG_S3_ACCESS_KEY_ID`     | `your-access-key`           | S3互換ストレージのアクセスキー                            |
| `LOG_S3_SECRET_ACCESS_KEY` | `your-secret-key`           | S3互換ストレージのシークレットキー                        |
| `LOG_S3_KEY_PREFIX`        | `logs`                      | S3に保存するオブジェクトキーのプレフィックス              |
| `LOG_S3_FORCE_PATH_STYLE`  | `false`                     | S3互換ストレージでパススタイルアクセスを使う場合は `true` |

- `LOG_BASE_DIR`: `access` / `turn_proceed` のサブディレクトリを配下に作成します。
- `LOG_TRANSPORT_MODE`: `file` はローカルファイル、`s3` はS3互換ストレージへの保存です。カンマで区切り複数指定可能（例：`file,s3`）。
- `LOG_S3_*` 系: `LOG_TRANSPORT_MODE` が `s3` を含むときに使います。

---

## ログインボーナス設定

| 変数名                           | 例     | 説明                                     |
| -------------------------------- | ------ | ---------------------------------------- |
| `NEXT_PUBLIC_ENABLE_LOGIN_BONUS` | `true` | ログインボーナスを有効にするか           |
| `NEXT_PUBLIC_LOGIN_BONUS_MONEY`  | `200`  | ログインボーナスで付与する資金量（億円） |
| `NEXT_PUBLIC_LOGIN_BONUS_FOOD`   | `2000` | ログインボーナスで付与する食料量（トン） |

---

## ゲームパラメータ設定

### マップ・計画

| 変数名                    | 例   | 説明                                                      |
| ------------------------- | ---- | --------------------------------------------------------- |
| `NEXT_PUBLIC_MAP_SIZE`    | `12` | マップのサイズ（マップは `MAP_SIZE × MAP_SIZE` の正方形） |
| `NEXT_PUBLIC_PLAN_LENGTH` | `20` | 計画キューの最大数                                        |

### 単位表示

| 変数名                   | 例     | 説明           |
| ------------------------ | ------ | -------------- |
| `NEXT_PUBLIC_UNIT_MONEY` | `億円` | 資金の単位表示 |
| `NEXT_PUBLIC_UNIT_FOOD`  | `トン` | 食料の単位表示 |
| `NEXT_PUBLIC_UNIT_AREA`  | `万坪` | 面積の単位表示 |

### 資金

| 変数名                                | 例       | 説明                                         |
| ------------------------------------- | -------- | -------------------------------------------- |
| `NEXT_PUBLIC_INIT_MONEY`              | `1000`   | 島の初期資金                                 |
| `NEXT_PUBLIC_MAX_MONEY`               | `9999`   | 資金の上限値                                 |
| `NEXT_PUBLIC_EARN_FACTORY_PER_PEOPLE` | `0.001`  | 工場1マスあたりの資金収入（規模1人あたり）   |
| `NEXT_PUBLIC_EARN_MINING_PER_PEOPLE`  | `0.001`  | 採掘場1マスあたりの資金収入（規模1人あたり） |
| `NEXT_PUBLIC_FOOD_TO_MONEY_RATE`      | `0.0008` | 食料を資金に変換するレート                   |

### 食料

| 変数名                               | 例       | 説明                                         |
| ------------------------------------ | -------- | -------------------------------------------- |
| `NEXT_PUBLIC_INIT_FOOD`              | `1000`   | 島の初期食料                                 |
| `NEXT_PUBLIC_MAX_FOOD`               | `999900` | 食料の上限値                                 |
| `NEXT_PUBLIC_EATEN_FOOD_PER_PEOPLE`  | `0.2`    | 人口1人あたりの食料消費量（毎ターン）        |
| `NEXT_PUBLIC_LACK_FOOD_DESTROY_RATE` | `25`     | 食料枯渇時に破壊される地形の割合（%）        |
| `NEXT_PUBLIC_EARN_FARM_PER_PEOPLE`   | `1`      | 農場1マスあたりの食料生産量（規模1人あたり） |

### 人口

| 変数名                                  | 例   | 説明                             |
| --------------------------------------- | ---- | -------------------------------- |
| `NEXT_PUBLIC_PEOPLE_GROWTH_VILLAGE`     | `10` | 村の人口増加量（毎ターン）       |
| `NEXT_PUBLIC_PEOPLE_GROWTH_TOWN`        | `10` | 町の人口増加量（毎ターン）       |
| `NEXT_PUBLIC_PEOPLE_GROWTH_CITY`        | `0`  | 都市の人口増加量（毎ターン）     |
| `NEXT_PUBLIC_PEOPLE_PROPAGANDA_VILLAGE` | `30` | プロパガンダ時の村の人口増加量   |
| `NEXT_PUBLIC_PEOPLE_PROPAGANDA_TOWN`    | `30` | プロパガンダ時の町の人口増加量   |
| `NEXT_PUBLIC_PEOPLE_PROPAGANDA_CITY`    | `3`  | プロパガンダ時の都市の人口増加量 |
| `NEXT_PUBLIC_PEOPLE_LOSS_FAMINE`        | `30` | 飢饉時の人口減少量（毎ターン）   |
| `NEXT_PUBLIC_VILLAGE_APPEARANCE_RATE`   | `20` | 平地に村が出現する確率 (%)       |

> [!NOTE]
> 人口の実数は設定値の100倍です。(1 = 100人)

### 植林

| 変数名                     | 例  | 説明                   |
| -------------------------- | --- | ---------------------- |
| `NEXT_PUBLIC_FOREST_VALUE` | `5` | 森の売値 (X億円/100本) |

---

## 自然災害・イベント設定

各イベント設定の判定単位は項目ごとに異なります。詳細は各項目の説明を参照してください。

| 変数名                                                   | 例         | 説明                                                    |
| -------------------------------------------------------- | ---------- | ------------------------------------------------------- |
| `NEXT_PUBLIC_EARTHQUAKE_RATE`                            | `0.5`      | 地震の発生確率（%）                                     |
| `NEXT_PUBLIC_EARTHQUAKE_DESTROY_RATE`                    | `25`       | 地震で破壊される地形の割合（%）                         |
| `NEXT_PUBLIC_TSUNAMI_RATE`                               | `1.5`      | 津波の発生確率（%）                                     |
| `NEXT_PUBLIC_TYPHOON_RATE`                               | `2`        | 台風の発生確率（%）                                     |
| `NEXT_PUBLIC_METEORITE_RATE`                             | `1.5`      | 隕石の発生確率（%）                                     |
| `NEXT_PUBLIC_CONTINUOUS_METEORITE_RATE`                  | `50`       | 隕石が連続して落下する確率（%）                         |
| `NEXT_PUBLIC_HUGE_METEORITE_RATE`                        | `0.5`      | 巨大隕石の発生確率（%）                                 |
| `NEXT_PUBLIC_ERUPTION_RATE`                              | `1`        | 火山噴火の発生確率（%）                                 |
| `NEXT_PUBLIC_FIRE_RATE`                                  | `1`        | 火災の発生確率（%）                                     |
| `NEXT_PUBLIC_FALL_DOWN_RATE`                             | `3`        | 面積境界を超えた島の地盤沈下判定率（% / turn）          |
| `NEXT_PUBLIC_FALL_DOWN_BORDER`                           | `9000`     | 地盤沈下条件 `島面積 > 境界` の面積境界（万坪）         |
| `NEXT_PUBLIC_BURIED_TREASURE_RATE`                       | `0.1`      | 整地1回あたりの埋蔵金発見率（%）                        |
| `NEXT_PUBLIC_OIL_FIELD_RATE`                             | `1`        | 海掘削1回あたりの油田発見率（%）                        |
| `NEXT_PUBLIC_OIL_EXHAUSTION_RATE`                        | `40`       | 油田1HEX・1turnあたりの枯渇率（%）                      |
| `NEXT_PUBLIC_OIL_EARN`                                   | `1000`     | 油田からの収益                                          |
| `NEXT_PUBLIC_MONSTER_SPAWN_RATE_BELOW_1M`                | `0.03`     | 100万人未満で人口比を掛ける基準率（% / turn）           |
| `NEXT_PUBLIC_MONSTER_RATE`                               | `0.006944` | 100万人以上で面積 `area / 100` と人口倍率を掛ける基準率 |
| `NEXT_PUBLIC_MONSTER_POPULATION_MULTIPLIER_PER_EXTRA_1M` | `0.25`     | 100万人超過分100万人ごとに加算する人口倍率係数          |

---

## 認証設定（サーバーサイドのみ）

| 変数名                       | 例         | 説明                                            |
| ---------------------------- | ---------- | ----------------------------------------------- |
| `ISSUER`                     | `JOHN_DOE` | JWTトークンの発行者識別子                       |
| `ACCESS_TOKEN_EXPIRES_HOUR`  | `1`        | アクセストークンの有効期限（時間）              |
| `REFRESH_TOKEN_EXPIRES_HOUR` | `720`      | リフレッシュトークンの有効期限（時間）          |
| `LOGIN_FAIL_LIMIT`           | `5`        | ログイン失敗の上限回数                          |
| `LOGIN_LOCK_MINUTE`          | `10`       | ログイン失敗上限超過後のロック時間（分）        |
| `MAX_SESSIONS`               | `3`        | 1ユーザーが同時に保持できるセッション数の上限   |
| `MAX_REGISTERED_USERS`       | `100`      | 登録可能な有効ユーザー数（`inhabited=1`）の上限 |

## 管理者認証設定（サーバーサイドのみ）

| 変数名                           | 例              | 説明                                                                 |
| -------------------------------- | --------------- | -------------------------------------------------------------------- |
| `MODERATOR_INITIAL_ID`           | `admin0001`     | 初期管理者ID。初回マイグレーション時に `moderator_auth` へ投入される |
| `MODERATOR_INITIAL_PASSWORD`     | `AdminPass1234` | 初期管理者パスワード（平文入力、DBにはハッシュで保存）               |
| `MODERATOR_INITIAL_USER_NAME`    | `Administrator` | 初期管理者ユーザー名                                                 |
| `MODERATOR_SESSION_EXPIRES_HOUR` | `12`            | 管理者セッションの有効期限（時間）                                   |

## その他 (サーバダードのみ)

| 変数名                             | 例   | 説明                                     |
| ---------------------------------- | ---- | ---------------------------------------- |
| `ISLAND_NAME_CHANGE_COOLDOWN_DAYS` | `30` | 島名を再変更できるまでのクールダウン日数 |

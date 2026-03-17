# Backtest Foundation

J-Quants API で日足データを取得し、日本株向けのシンプルなバックテストと公式 MCP 補助を回せる最小基盤です。

## 今あるもの

- J-Quants V2 API キー認証を優先しつつ、V1 のリフレッシュトークン / メール認証にも対応
- 日足クオート取得のマーケットデータ層
- 終値でシグナルを判定し、次営業日の寄り付きで約定するバックテストエンジン
- 日本株前提の `lotSize=100` と、固定コスト + 比率コストを注入できる `CostModel`
- strategy へは「その時点で見えているバーだけ」を渡す look-ahead ガード
- SMA クロス戦略のサンプル
- 公式 `j-quants-doc-mcp` を叩く MCP クライアント
- 依存ゼロの Node CLI とユニットテスト

## セットアップ

`.env.local` は `.gitignore` により Git には含まれません。必要に応じて以下を調整してください。

```dotenv
JQUANTS_API_VERSION=v2
JQUANTS_API_BASE_URL=https://api.jquants.com
JQUANTS_API_KEY_HEADER=x-api-key
JQUANTS_DAILY_QUOTES_PATH=
JQUANTS_LISTED_INFO_PATH=
BACKTEST_INITIAL_CASH=1000000
BACKTEST_LOT_SIZE=100
BACKTEST_FIXED_COMMISSION=0
BACKTEST_FEE_BPS=0
```

## 使い方

認証確認:

```powershell
node src/cli/index.js jquants ping --code 7203
```

日足データ確認:

```powershell
node src/cli/index.js jquants quotes --code 7203 --from 2024-01-01 --to 2024-03-31
```

SMA クロスのバックテスト:

```powershell
node src/cli/index.js backtest sma --code 7203 --from 2024-01-01 --to 2024-12-30 --short 5 --long 20 --lot-size 100 --fee-bps 10
```

MCP サーバの公開ツール一覧:

```powershell
node src/cli/index.js mcp tools
```

MCP にエンドポイント説明を聞く:

```powershell
node src/cli/index.js mcp describe --endpoint eq-bars-daily
```

MCP が生成したサンプルコードで実データ取得:

```powershell
node src/cli/index.js mcp fetch-bars --code 7203 --from 2024-01-01 --to 2024-01-31
```

## Strategy 契約

strategy の `decide()` には、次の入力だけが渡されます。

- `bars`: 現在バーまでの可視データだけ。未来バーは渡されません。
- `index`: `bars` 内での現在位置。常に最後のバーを指します。
- `absoluteIndex`: 元データ配列での位置。
- `position`: 現在ポジション。`1` が保有、`0` が未保有です。

このルールで、strategy 側の実装ミスによる look-ahead を起こしにくくしています。

## MCP メモ

- 公式 README に沿って `j-quants-doc-mcp` を Python 仮想環境へインストール済みです
- `mcp fetch-bars` は MCP から `eq-bars-daily` の Python サンプルコードを受け取り、関数名と実行引数を整えてから実データ取得まで実行します
- この MCP は API ドキュメント支援用です。実運用の売買ロジックそのものではなく、正しいエンドポイント情報とサンプルコード生成を補助します

## 既知の制約

- 現状は単銘柄中心の基盤です。複数銘柄ポートフォリオやユニバース選定は未実装です
- 複数銘柄スクリーニングへ広げる場合、J-Quants マスターだけでは過去時点の全銘柄ユニバースを完全再現できず、survivorship bias が残る可能性があります
- 価格正規化は調整済みフィールドを優先しています。未調整価格の検証が必要なら別モードを追加する必要があります
- 値幅制限、寄らない日、板の薄さ、スリッページはまだ未実装です
- `CostModel` は入れられますが、現在の CLI は固定コストと比率コストまでです

## 次に足すと良いもの

- スリッページモデル
- Portfolio クラスと複数銘柄同時保有
- ベンチマーク比較とエクイティカーブ出力
- DataProvider 抽象化と EDINET / イベント駆動戦略の統合
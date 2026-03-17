# Backtest Foundation — Claude Code 指示

このリポジトリは日本株ファンダメンタル×テクニカル複合バックテスト基盤です。

## データソース

| ソース | 用途 | 接続 |
|--------|------|------|
| J-Quants API | 日足 OHLCV・時価総額・銘柄マスタ | `.env.local` の `JQUANTS_API_KEY` |
| EDINET DB API | 財務データ・決算短信・財務健全性スコア | MCP (`edinetdb`) または `EDINET_DB_API_KEY` |

## アーキテクチャ

```
src/
├── backtest/
│   ├── engine.js              # コアエンジン（look-ahead bias 回避済み）
│   └── strategies/            # 戦略は Strategy インターフェースで実装
│       ├── smaCross.js        # テクニカル戦略サンプル
│       └── cfDivergence.js    # CF ダイバージェンス戦略（実装予定）
├── data/
│   ├── eventTimeline.js       # as-of 結合で look-ahead bias を回避
│   ├── cache.js               # API レスポンスのローカルキャッシュ
│   └── providers/
│       ├── base.js            # DataProvider 抽象クラス
│       ├── jquantsProvider.js # J-Quants 実装
│       ├── edinetProvider.js  # EDINET DB 実装
│       └── composite.js       # P/CF 等の複合指標を計算
├── cli/
│   └── index.js               # CLI エントリポイント
└── lib/
    ├── config.js              # 環境変数ベース設定
    ├── jquants/               # J-Quants HTTP クライアント
    └── mcp/                   # MCP クライアント
```

## 設計上の重要ルール

### Look-Ahead Bias の回避
- ファンダメンタルデータは `EventTimeline.getAsOf(date)` 経由でのみ参照すること
- `get_financials` の `submitDateTime`（有報提出日）を `availableFrom` として使う
- 決算短信は `disclosureTime >= 15:00` の場合のみ翌営業日から利用可能

### 銘柄コード変換
- J-Quants: `Code = "72030"` (5桁)
- EDINET DB: `secCode = "72030"` → `edinetCode = "E02144"` は `search_companies` で解決
- `normalizeCode("7203") → "72030"` で統一

### データソース役割分担
- **価格軸**: J-Quants のみ（EDINET DB に株価データはない）
- **シグナル軸**: EDINET DB（財務・CF・健全性スコア）
- **複合指標** (P/CF, FCF利回り等): `CompositeProvider` で計算

## 新戦略の追加方法

```js
// src/backtest/strategies/myStrategy.js
export function createMyStrategy(params = {}) {
  return {
    name: 'my_strategy',
    decide({ bar, fundamentals, cfMetrics, position }) {
      // 1 = フルロング、0 = ノーポジション
      return 1;
    }
  };
}
```

## キャッシュポリシー

| API | キャッシュ有効期限 |
|-----|------------------|
| `get_financials` | 24時間 |
| `get_earnings` | 1時間 |
| `search_companies` | 7日間 |
| `get_text_blocks` | 30日間 |
| J-Quants 日足（過去） | 無期限 |
| J-Quants 日足（当日） | 1時間 |

## EDINET DB の既知制限

- 営業利益が null: IFRS 総合商社5社、US GAAP 企業6社、銀行業
- 配当は株式分割未遡及 → `adjustedDividendPerShare` を使うこと
- 時価総額は持たない → J-Quants との結合が必須
- 決算短信は直近30日分のみ（TDNet）

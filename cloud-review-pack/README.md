# Backtest Foundation

J-Quants API 縺ｧ譌･雜ｳ繝・・繧ｿ繧貞叙蠕励＠縲√す繝ｳ繝励Ν縺ｪ譌･谺｡繝舌ャ繧ｯ繝・せ繝医ｒ蝗槭＠縺､縺､縲∝・蠑・MCP 繧ｵ繝ｼ繝舌ｂ菴ｵ逕ｨ縺ｧ縺阪ｋ譛蟆丞渕逶､縺ｧ縺吶・
## 莉翫≠繧九ｂ縺ｮ

- J-Quants V2 API 繧ｭ繝ｼ隱崎ｨｼ繧貞━蜈医＠縺､縺､縲〃1 縺ｮ繝ｪ繝輔Ξ繝・す繝･繝医・繧ｯ繝ｳ / 繝｡繝ｼ繝ｫ隱崎ｨｼ縺ｫ繧ょｯｾ蠢・- 譌･雜ｳ繧ｯ繧ｪ繝ｼ繝亥叙蠕励・繝槭・繧ｱ繝・ヨ繝・・繧ｿ螻､
- 邨ょ､縺ｧ繧ｷ繧ｰ繝翫Ν蛻､螳壹＠縲∵ｬ｡雜ｳ蟇・ｊ縺ｧ邏・ｮ壹☆繧九ヰ繝・け繝・せ繝医お繝ｳ繧ｸ繝ｳ
- SMA 繧ｯ繝ｭ繧ｹ謌ｦ逡･縺ｮ繧ｵ繝ｳ繝励Ν
- 蜈ｬ蠑・`j-quants-doc-mcp` 繧貞娼縺・stdio MCP 繧ｯ繝ｩ繧､繧｢繝ｳ繝・- 萓晏ｭ倥ぞ繝ｭ縺ｮ Node CLI 縺ｨ繝ｦ繝九ャ繝医ユ繧ｹ繝・
## 繧ｻ繝・ヨ繧｢繝・・

`.env.local` 縺ｯ縺吶〒縺ｫ菴懈・貂医∩縺ｧ縲～.gitignore` 縺ｫ繧医ｊ Git 縺ｫ縺ｯ蜷ｫ縺ｾ繧後∪縺帙ｓ縲・
蠢・ｦ√↓蠢懊§縺ｦ莉･荳九ｒ隱ｿ謨ｴ縺励※縺上□縺輔＞縲・
```dotenv
JQUANTS_API_VERSION=v2
JQUANTS_API_BASE_URL=https://api.jquants.com
JQUANTS_API_KEY_HEADER=x-api-key
JQUANTS_DAILY_QUOTES_PATH=
JQUANTS_LISTED_INFO_PATH=
BACKTEST_INITIAL_CASH=1000000
```

J-Quants 蛛ｴ縺ｮ繧ｨ繝ｳ繝峨・繧､繝ｳ繝亥ｷｮ蛻・′縺ゅｋ蝣ｴ蜷医・縲～JQUANTS_DAILY_QUOTES_PATH` 縺ｨ `JQUANTS_LISTED_INFO_PATH` 繧呈・遉ｺ謖・ｮ壹☆繧九→蝗ｺ螳壹〒縺阪∪縺吶・
## 菴ｿ縺・婿

隱崎ｨｼ遒ｺ隱・

```powershell
node src/cli/index.js jquants ping --code 7203
```

譌･雜ｳ繝・・繧ｿ遒ｺ隱・

```powershell
node src/cli/index.js jquants quotes --code 7203 --from 2024-01-01 --to 2024-03-31
```

SMA 繧ｯ繝ｭ繧ｹ縺ｮ繝舌ャ繧ｯ繝・せ繝・

```powershell
node src/cli/index.js backtest sma --code 7203 --from 2024-01-01 --to 2024-12-30 --short 5 --long 20
```

MCP 繧ｵ繝ｼ繝舌・蜈ｬ髢九ヤ繝ｼ繝ｫ荳隕ｧ:

```powershell
node src/cli/index.js mcp tools
```

MCP 縺ｫ繧ｨ繝ｳ繝峨・繧､繝ｳ繝郁ｪｬ譏弱ｒ閨槭￥:

```powershell
node src/cli/index.js mcp describe --endpoint eq-bars-daily
```

MCP 縺檎函謌舌＠縺溘し繝ｳ繝励Ν繧ｳ繝ｼ繝峨〒螳溘ョ繝ｼ繧ｿ蜿門ｾ・

```powershell
node src/cli/index.js mcp fetch-bars --code 7203 --from 2024-01-01 --to 2024-01-31
```

## MCP 繝｡繝｢

- 蜈ｬ蠑・README 縺ｫ豐ｿ縺｣縺ｦ `j-quants-doc-mcp` 繧・Python 莉ｮ諠ｳ迺ｰ蠅・∈繧､繝ｳ繧ｹ繝医・繝ｫ貂医∩縺ｧ縺・- `mcp fetch-bars` 縺ｯ MCP 縺九ｉ `eq-bars-daily` 縺ｮ Python 繧ｵ繝ｳ繝励Ν繧ｳ繝ｼ繝峨ｒ蜿励￠蜿悶ｊ縲√◎縺ｮ繧ｳ繝ｼ繝峨ｒ螳溯｡後＠縺ｦ繝・・繧ｿ蜿門ｾ励＠縺ｾ縺・- 縺薙・ MCP 縺ｯ API 繝峨く繝･繝｡繝ｳ繝育音蛹悶↑縺ｮ縺ｧ縲∝ｮ溘ョ繝ｼ繧ｿ縺昴・繧ゅ・縺ｧ縺ｯ縺ｪ縺上∵ｭ｣縺励＞繧ｨ繝ｳ繝峨・繧､繝ｳ繝域ュ蝣ｱ縺ｨ繧ｵ繝ｳ繝励Ν繧ｳ繝ｼ繝臥函謌舌ｒ諡・＞縺ｾ縺・
## 險ｭ險医Γ繝｢

- 繝舌ャ繧ｯ繝・せ繝医・邨ょ､繝吶・繧ｹ縺ｧ繧ｷ繧ｰ繝翫Ν繧貞・縺励∵ｬ｡蝟ｶ讌ｭ譌･縺ｮ蟋句､縺ｧ螢ｲ雋ｷ縺励∪縺・- 螢ｲ雋ｷ繧ｳ繧ｹ繝医√せ繝ｪ繝・・繝ｼ繧ｸ縲∽ｿ｡逕ｨ蜿門ｼ輔∬､・焚驫俶氛蜷梧凾菫晄怏縺ｯ縺ｾ縺譛ｪ螳溯｣・〒縺・- J-Quants 縺ｮ繝ｬ繧ｹ繝昴Φ繧ｹ蟾ｮ蛻・↓蛯吶∴縺ｦ縲∬､・焚蛟呵｣懊ヱ繧ｹ縺ｨ隍・焚繧ｭ繝ｼ蜷阪ｒ蜷ｸ蜿弱☆繧区ｭ｣隕丞喧繧貞・繧後※縺・∪縺・
## 谺｡縺ｫ雜ｳ縺吶→濶ｯ縺・ｂ縺ｮ

- 謇区焚譁・/ 繧ｹ繝ｪ繝・・繝ｼ繧ｸ
- 繝吶Φ繝√・繝ｼ繧ｯ豈碑ｼ・→繧ｨ繧ｯ繧､繝・ぅ繧ｫ繝ｼ繝門・蜉・- 隍・焚驫俶氛繝昴・繝医ヵ繧ｩ繝ｪ繧ｪ
- EDINET 繧､繝吶Φ繝医ｒ菴ｿ縺｣縺溘す繧ｰ繝翫Ν逕滓・
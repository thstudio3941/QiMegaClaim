# QiMegaClaim 圖示製作規格

建議製作一張 **512 × 512 px、正方形、sRGB PNG** 原稿，可使用透明背景。以實際像素尺寸為準，DPI 不影響擴充功能顯示。也可保留 AI／SVG 向量原稿，但 manifest 最後使用 PNG。

| PNG 檔名 | 尺寸 | 用途 |
|---|---|---|
| icon16.png | 16 × 16 px | 小圖示／工具列 |
| icon32.png | 32 × 32 px | 工具列高密度螢幕 |
| icon48.png | 48 × 48 px | 擴充功能管理頁 |
| icon64.png | 64 × 64 px | 工具列額外高密度尺寸 |
| icon96.png | 96 × 96 px | 管理頁 2× 尺寸 |
| icon128.png | 128 × 128 px | 安裝／商店圖示 |
| icon256.png | 256 × 256 px | 高密度備用 |
| icon512.png | 512 × 512 px | 原稿／大型備用 |

Chrome 的主要尺寸為 16／32／48／128；其餘尺寸提供高密度顯示選擇，實際採用由瀏覽器決定。請從原稿各自縮小輸出，避免將小圖放大。小尺寸以簡單、清楚的輪廓為主；細小文字通常無法辨識。

2026-11-17 已換成提供的綠底 Quixel 圖示。提供的 `icon512.png` 實際為 2134 × 2134 px，原稿保存於專案外層 `ref/icon-source-2134.png`；上述 8 種尺寸均直接從原稿縮小輸出，安裝用 `icon512.png` 已正規化為 512 × 512 px。更新後請在擴充功能管理頁按「重新載入」。

官方參考：[Configure extension icons](https://developer.chrome.com/docs/extensions/develop/ui/configure-icons)、[Manifest icons](https://developer.chrome.com/docs/extensions/reference/manifest/icons)。

## 聯絡

TH Studio · thstudio3419@pm.me

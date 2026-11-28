# X 长文复审复现脚本

对应[复审报告](../X_VIDEO_AND_ARTICLE_THIRD_PARTY_REVIEW_2026-11-28.md)。在 `personal-digital-companion` 目录运行。脚本只导入被测代码，数据写系统临时目录。输出 `[复现]` 表示问题仍在，`[未复现]` 表示该判定已通过。

```powershell
node docs/reviews/x-article-review-repro/repro-core.mjs
```

```powershell
node docs/reviews/x-article-review-repro/repro-more.mjs
```

Electron 脚本先执行 `node tools/build-desktop.mjs`，并清除 `ELECTRON_RUN_AS_NODE`：

```powershell
.\desktop\node_modules\electron\dist\electron.exe tools/run-electron-check.mjs docs/reviews/x-article-review-repro/repro-electron.mjs
```

```powershell
.\desktop\node_modules\electron\dist\electron.exe tools/run-electron-check.mjs docs/reviews/x-article-review-repro/repro-ui.mjs
```

`live-diag.mjs` 会联网匿名打开一个公开帖子（不带 Cookie、不下载媒体），打印页面结构并截图到临时目录，用于 F1。

| 输出标识 | 发现 |
| --- | --- |
| A-overwrite-loss | F2 |
| B-catalog-corrupt、C-catalog-late-disk | F5 |
| D-thumb-after-move、J-root-switch | F6 |
| E-name-archive | F11 |
| F-archive-truncate | F12 |
| G-part-left | F14 |
| H-startup-throw | F10 |
| I-path-escape | F15 |
| K-article-breakpoint、O-tco-after-timeout | F13 |
| M-overwrite-stale | F8 |
| N-video-unarchive | F16（若决定只改文档，此项会继续复现） |
| E2 | F3 |
| E3 | F4 |
| E4、E5 | F7 |
| E6、E7 | F9 |
| E1 | 中止抓取能结束，复审时即通过，用作回归 |

判定按报告建议的修法写成。采用别的修法时，按实际行为调整判定并说明。

## 第二次复审新增（对应[修复复审报告](../X_VIDEO_AND_ARTICLE_FIX_THIRD_PARTY_REVIEW_2026-11-28.md)）

三个脚本都用 Electron 运行（方式同上）。`recheck-scraper.mjs` 与 `recheck-e2e.mjs` 含匿名打开公开帖子的联网步骤，不带 Cookie、不下载媒体文件。

| 脚本 / 标识 | 发现 |
| --- | --- |
| `recheck-scraper.mjs` S1、LIVE；`recheck-e2e.mjs` E2E 输出 | G1 |
| `recheck-timing.mjs` Q1、Q2；`recheck-scraper.mjs` Q1、Q2 | G2 |
| Q3 | G3 |
| P1、P2 | G4 |
| R1 | G5 |
| `recheck-e2e.mjs` T1 | G6 |

`repro-core.mjs` 在第二次复审中修正了两处脚本自身缺陷（B 的提示文字解析、I 的 `play` 异常），修好后的代码可以完整跑完。

---
name: gas-leave-application
description: >-
  Develop and maintain the GAS Automated Leave Application Google Chat bot
  (clasp, modular src/, Sheet roster, Doc generation). Use when working on this
  repo, ChatBot modules, clasp push/pull, leave form cards, roster, or testing
  the leave application bot.
---

# GAS Automated Leave Application

Google Apps Script（V8）Google Chat 事假申請機器人。卡片表單 → Google Sheet → 可選 Google Doc 請假單。

## 專案布局

| 路徑 | 用途 |
|------|------|
| `src/` | **唯一部署目錄**（`.clasp.json` → `rootDir: "src"`） |
| `templates/` | 本地範本，**不** push（`ChatBot_template.js`、`Code.js`） |
| `docs/` | 說明圖片等非程式資源 |

```bash
npm run push    # clasp push
npm run pull    # clasp pull
clasp open      # 開啟正確的 Apps Script 編輯器
clasp status    # 應列出 src/ 下 10 個檔案
```

## 模組職責（GAS 全域命名空間，無 import）

| 檔案 | 職責 |
|------|------|
| `ChatBot.js` | Chat 入口：`onMessage`、`onCardClick`、`onAddToSpace` |
| `ChatBotConfig.js` | 常數、試算表/Doc ID、班別/時段/原因選項 |
| `FormUtils.js` | 表單解析、`getChatBotUserKey_` |
| `LeaveFieldLogic.js` | 請假類型 → 試算表欄位、時段換算 |
| `LeaveDocService.js` | Doc 範本替換與產生 |
| `LeaveSheetService.js` | 試算表 append、標題列、`ensureLeaveSheetHeaders_` |
| `RosterService.js` | 名冊讀取、快取、班別/學生下拉 |
| `LeaveFormCard.js` | cardsV2 卡片 UI |
| `LeaveFormSubmit.js` | 送出驗證、Doc 產生流程、圖片附件更新文件情況 |
| `MainMenuCard.js` | 主選單（事假 / 工作記錄 / 黃紙跟進） |
| `WorkLogFormCard.js` | 工作記錄卡片 UI |
| `WorkLogFormSubmit.js` | 工作記錄送出（GAS 名冊 + Gemini 解析） |
| `WorkLogGemini.js` | Gemini API：事件描述 → 違規類別/處理等級 |
| `YellowSlipSheetService.js` | 黃紙試算表讀取／級訓導欄寫入 |
| `YellowSlipFormCard.js` | 黃紙跟進卡片（檢索 + 級訓導跟進） |
| `YellowSlipFormSubmit.js` | 級訓導跟進送出 |
| `YellowSlipGemini.js` | Gemini：備註草稿潤飾 |
| `SlashCommandRouter.js` | Slash command 路由 |

## 開發慣例

1. **設定集中於** `src/ChatBotConfig.js`（試算表 ID、工作表名、Doc 範本、鐘點表）。
2. **內部函式**以尾綴 `_` 命名（如 `buildSheetLeaveFields_`）。
3. **避免與 templates/Code.js 衝突**：Chat Bot 用 `getChatBotUserKey_`、`ensureLeaveSheetHeaders_`（templates 不部署，但命名仍區隔）。
4. **最小 diff**：新功能放對應模組，勿把邏輯塞回 `ChatBot.js`。
5. **名冊邏輯變更**時遞增 `ROSTER_CACHE_VERSION_`。

## Chat 事件流程

```
onMessage → handleSlashCommand_ 或文字關鍵字 或 buildMainMenuCard_
Slash: /事假 /工作記錄 /黃紙 /選單（Command ID 1/2/4/3，見 reference.md）
onCardClick → invokedFunction: ...
```

工作記錄：姓名/班別僅 GAS 名冊；`wlEventDescription` 送出後才送 Gemini（Script property `GEMINI_API_KEY`）。

黃紙跟進：試算表 A–F 黃紙、O–T 跟進；級訓導以下拉寫入 Q／選填備註寫入 R。

請假類型 value：`day_slots` | `half_full_day` | `full_day_range`

## 修改檢查清單

- [ ] 只改 `src/`，不動 `templates/`
- [ ] 新常數放 `ChatBotConfig.js`
- [ ] 卡片欄位名與 `getFormValue_` / `handleSubmitLeaveForm_` 一致
- [ ] 名冊欄位標題與 `ROSTER_HEADERS_` 一致（`Class`、`No.`、`Chinese Name`）
- [ ] Doc 占位符與 `buildLeaveDocReplacements_` 一致
- [ ] `clasp status` 顯示 tracked 檔案後再 push
- [ ] 工作記錄需設定 Script property `GEMINI_API_KEY`

## 測試

- `onMessage` / `onCardClick` **不可**在編輯器按「執行」；須在 Google Chat 觸發。
- push 成功但編輯器空白：用 `clasp open` 開正確 scriptId，硬重新整理。
- 除錯：Apps Script → Executions；卡片結構可暫用 `Logger.log(JSON.stringify(buildLeaveFormCard_()))`。

## 詳細參考

- 試算表欄位、Doc 占位符、名冊快取、常見問題 → [reference.md](reference.md)

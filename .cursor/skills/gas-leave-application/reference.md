# GAS Leave Application — Reference

## 試算表

單一試算表（`SPREADSHEET_ID_`）含兩個工作表：

| 常數 | 預設工作表 | 用途 |
|------|-----------|------|
| `LEAVE_SHEET_NAME_` | `Record` | 請假紀錄 |
| `ROSTER_SHEET_NAME_` | `StudentList` | 學生名冊 |

### 請假紀錄欄位（`LEAVE_SHEET_HEADERS_`）

申請時間、班別、學號、姓名、請假類型、事假日期(開始)、事假日期(結束)、請假時間(開始)、請假時間(結束)、離校時間、原因、文件情況、批核者、請假單、已列印（O）

「已列印」空白／非 `LEAVE_PRINTED_TRUE_VALUES_` → 未列印；上學天每日摘要會列出。

## 上學天每日通知

- 模組：`DailyDigestNotifyService.js`
- 上學天：週一至週五，排除 `HK_PUBLIC_HOLIDAYS_`／`SCHOOL_EXTRA_NON_SCHOOL_DAYS_`
- 內容：未列印事假（含事假日期）＋黃紙待跟進（列明班主任／級訓導／訓導主任）
- 目標空間：`DAILY_DIGEST_CHAT_SPACE_NAME_` 或 Bot `onAddToSpace` 記住的 Script Property
- 設定：編輯器執行一次 `setupDailySchoolDayDigestTrigger()`；測試用 `testDailySchoolDayDigest()`

### 名冊欄位（第一列標題）

- `Class` → 班別
- `No.` → 學號
- `Chinese Name` → 姓名

學生下拉 value 格式：`班別::學號`（`rosterDropdownValueFor_`），避免跨班重複學號。

## 請假類型與試算表寫入

| value | UI | 試算表時間欄 |
|-------|-----|-------------|
| `day_slots` | 一天時段 | 由節次下拉換算 HH:mm |
| `half_full_day` | 半天/全天 | `HALF_FULL_DAY_CLOCK_` |
| `full_day_range` | 日期區間 | 時間欄寫「全天」 |

核心函式：`buildSheetLeaveFields_(data)` → append 至 `LeaveSheetService.appendLeaveToSheet_`

## Google Doc 請假單

設定：`LEAVE_DOC_TEMPLATE_ID_`、`LEAVE_DOC_OUTPUT_FOLDER_ID_`

範本占位符（須完全一致）：

```
{{Name}} {{Class}} {{StudentId}} {{Reason}} {{ApplyDate}} {{DocumentStatus}}
{{CheckRange}} {{CheckSlot}} {{LeaveRangeSentence}} {{LeaveSlotSentence}}
{{LeaveDate}} {{LeaveTime}} {{exitTime}}
```

流程：`buildLeaveDocReplacements_` → `generateLeaveDocFromSubmission_` → `updateLeaveFormUrlByRow_`

## 文件情況

- 送出預設：`需補交`（`DOCUMENT_STATUS_NEED_SUBMIT_`）
- Chat 上傳圖片後：`有相關文件`（`DOCUMENT_STATUS_HAS_FILE_`）
- 以 `getChatBotUserKey_` 存 `lastRow:{userKey}`，更新最新一筆

## 工作記錄（WorkLog）

試算表：`WORK_LOG_SPREADSHEET_ID_`（獨立於請假/名冊試算表）

工作表：`WORK_LOG_SHEET_NAME_` 留空 → 使用第一個工作表（gid=0）

| 欄位 | 來源 |
|------|------|
| 日期、時間 | GAS（送出當下） |
| 班別、學生姓名 | GAS 名冊 |
| 違規類別、處理等級、事件詳情、是否需發信 | Gemini（僅原始描述） |
| 跟進狀態 | 預設 `待跟進` |
| 原始完整描述 | 使用者輸入原文 |

設定：

- Script property：`GEMINI_API_KEY`
- 分類清單：`WORK_LOG_VIOLATION_CATEGORIES_`、`WORK_LOG_HANDLING_LEVELS_`（`ChatBotConfig.js`）
- 模型：`GEMINI_MODEL_`（預設 `gemini-3.6-flash`）

Chat 觸發：主選單 →「工作記錄」，或輸入「工作記錄」，或 `/工作記錄`。

## 黃紙跟進（Yellow Slip）

試算表：`YELLOW_SLIP_SPREADSHEET_ID_`（獨立）

| 欄位 | 位置 | 用途 |
|------|------|------|
| Class, ClassNo, Name, ItemTaken, By, DateTime | A–F | 黃紙紀錄（顯示） |
| 班主任, 備註, 級訓導, 備註, 訓導主任, 備註 | O–T | 各角色跟進（顯示／寫入） |

級訓導流程：選班別 → 檢視紀錄 → 下拉選黃紙 → 下拉選跟進選項（寫入 Q）→ 選填備註（送出時 Gemini 潤飾後寫入 R）。

跟進選項：`YELLOW_SLIP_GRADE_DISCIPLINE_OPTIONS_`（`ChatBotConfig.js`）

備註潤飾：`YellowSlipGemini.js`（需 Script property `GEMINI_API_KEY`）

Chat 觸發：主選單 →「黃紙跟進」，或輸入「黃紙」，或 `/黃紙`（Command ID 3）。

## Slash Commands（Google Chat API 設定）

程式唯一來源：`ChatBotConfig.js` → `SLASH_COMMANDS_`（id / name / aliases / description / action）。

### Console 應登記的 4 筆（勿把別名建成獨立指令）

| Command ID | Name（須含 `/`） | Description | action |
|------------|------------------|-------------|--------|
| 1 | `/事假` | 開啟事假申請表單 | leave |
| 2 | `/工作記錄` | 開啟工作記錄表單 | worklog |
| 3 | `/黃紙` | 開啟黃紙跟進 | yellow |
| 4 | `/選單` | 開啟主選單 | menu |

別名（不必登記 Console）：`leave`/`請假`、`worklog`/`違規`、`menu`/`help`/`幫助`、`yellowslip`/`黃紙跟進`。

### 重新設定步驟

1. 開啟 [Google Cloud Console → Google Chat API → Configuration](https://console.cloud.google.com/apis/api/chat.googleapis.com/hangouts-chat)（選對專案）。
2. 找到 **Commands**（或「Slash commands」）區塊。
3. **刪除**舊的／重複的指令（錯誤 ID、英文別名當獨立指令、多餘項目）。
4. **新增**上表 4 筆，欄位對齊：
   - **Command ID** = 整數 `1` / `2` / `3` / `4`
   - **Name** = `/事假` 等（**必須以 `/` 開頭**）
   - **Description** = 上表說明
   - **Command type** = **Slash command**（不要選 Quick command，除非你有意改架構）
5. 頁面最下方按 **Save**。
6. 若使用「部署為 Chat App」：到 Apps Script → **部署** → 確認 Chat 用的是最新版本（或新建版本再掛上）。
7. 在 Google Chat 空間輸入 `/`，應只看到上述 4 個建議；再測 `/事假`、`/工作記錄`、`/黃紙`、`/選單`。

### 常見問題

| 症狀 | 原因／處理 |
|------|------------|
| `/事假` 回「未知的 slash command」 | Console 的 Command ID ≠ 程式 `SLASH_COMMANDS_.id`；對齊後 Save |
| 輸入 `/` 出現一堆舊指令 | Console 有殘留指令；刪除後只留 4 筆 |
| 有時走 `onMessage`、有時走 `onAppCommand` | 正常；兩者都經 `SlashCommandRouter.js` |
| 改了程式沒反應 | `npm run push` 後重新部署 Chat App／硬重新整理 Chat |

---

## clasp 設定

```json
// .clasp.json
{ "rootDir": "src", "scriptId": "..." }
```

- 僅 `src/` 內 `.js` + `appsscript.json` 會 push
- `templates/` 在 repo 根目錄，不在 rootDir，不會部署
- push **整份覆蓋**遠端專案，勿在編輯器手改後忘記 pull

## 常見問題

| 症狀 | 處理 |
|------|------|
| push 有紀錄、編輯器無檔案 | `clasp open` + 硬重新整理；確認 scriptId |
| 名冊下拉空白 | 檢查 `Class` 欄與表單班別字串一致；看 `ROSTER_MAX_STUDENTS_PER_CLASS_` |
| 名冊改了沒反映 | 遞增 `ROSTER_CACHE_VERSION_` 或等 TTL（15 分） |
| Chat 行為未更新 | 重新部署 Chat App / 測試部署 |
| clasp push 警告 glob/node-domexception | clasp  transitive deps，可忽略 |

## 函式索引（依模組）

<details>
<summary>ChatBot.js</summary>

- `onMessage`, `onCardClick`, `onAddToSpace`, `onRemoveFromSpace`
- `buildUpdateMessageResponse_`
</details>

<details>
<summary>LeaveFormSubmit.js</summary>

- `handleSubmitLeaveForm_`, `hasImageAttachment_`, `handleDocumentAttachment_`
- `updateDocumentStatusByRow_`
</details>

<details>
<summary>RosterService.js</summary>

- `getRosterDistinctClasses_`, `getRosterStudentsByClass_`
- `lookupRosterStudentByClassAndId_`, `lookupRosterStudentById_`
</details>

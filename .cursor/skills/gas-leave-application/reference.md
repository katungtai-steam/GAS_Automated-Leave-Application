# GAS Leave Application — Reference

## 試算表

單一試算表（`SPREADSHEET_ID_`）含兩個工作表：

| 常數 | 預設工作表 | 用途 |
|------|-----------|------|
| `LEAVE_SHEET_NAME_` | `Record` | 請假紀錄 |
| `ROSTER_SHEET_NAME_` | `StudentList` | 學生名冊 |

### 請假紀錄欄位（`LEAVE_SHEET_HEADERS_`）

申請時間、班別、學號、姓名、請假類型、事假日期(開始)、事假日期(結束)、請假時間(開始)、請假時間(結束)、離校時間、原因、文件情況、批核者、請假單

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

工作表：`WorkLog`（不存在時自動建立）

| 欄位 | 來源 |
|------|------|
| 記錄時間、班別、學號、姓名、記錄者 | GAS 名冊 / 事件 |
| 事件描述 | 使用者輸入 |
| 違規類別、處理等級 | **僅** `wlEventDescription` 送 Gemini |

設定：

- Script property：`GEMINI_API_KEY`
- 分類清單：`WORK_LOG_VIOLATION_CATEGORIES_`、`WORK_LOG_HANDLING_LEVELS_`（`ChatBotConfig.js`）
- 模型：`GEMINI_MODEL_`（預設 `gemini-2.0-flash`）

Chat 觸發：主選單 →「工作記錄」，或輸入「工作記錄」。

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

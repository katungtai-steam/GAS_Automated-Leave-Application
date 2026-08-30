# GAS Automated Leave Application

Google Apps Script（V8）建立的 Google Chat 事假申請機器人。學生在聊天室填寫卡片表單，資料寫入 Google Sheet，並可自動產生 Google Doc 請假單。

## 專案結構

```
├── src/                    # 部署至 Apps Script（clasp push）
│   ├── ChatBot.js          # Chat 事件入口
│   ├── ChatBotConfig.js    # 常數與選項
│   ├── FormUtils.js        # 表單解析工具
│   ├── LeaveFieldLogic.js  # 請假欄位計算
│   ├── LeaveDocService.js  # 請假單 Doc 產生
│   ├── LeaveSheetService.js
│   ├── RosterService.js    # 學生名冊
│   ├── LeaveFormCard.js    # 卡片 UI
│   ├── LeaveFormSubmit.js  # 送出與驗證
│   └── appsscript.json
├── templates/              # 本地範本（不部署）
│   ├── ChatBot_template.js
│   └── Code.js
├── docs/                   # 說明用圖片等
├── package.json
└── .clasp.json
```

## 主要功能

- 在 Google Chat 輸入文字即可開啟「學生事假申請」卡片表單
- 支援三種請假類型：一天時段、半天／全天、日期區間
- 從試算表名冊選取學生（班別 + 學號）
- 送出後寫入 Google Sheet，並依範本產生 Google Doc 請假單
- 聊天室上傳圖片後，自動更新最新一筆的「文件情況」

## 設定

在 `src/ChatBotConfig.js` 調整：

- `SPREADSHEET_ID_`：試算表 ID（請假紀錄 + 學生名冊）
- `LEAVE_SHEET_NAME_` / `ROSTER_SHEET_NAME_`：工作表名稱
- `LEAVE_DOC_TEMPLATE_ID_` / `LEAVE_DOC_OUTPUT_FOLDER_ID_`：請假單範本與輸出資料夾

## 開發與部署

```bash
npm install -g @google/clasp   # 首次
clasp login
npm run push                     # 或 clasp push
clasp open                       # 在瀏覽器開啟 Apps Script 編輯器
```

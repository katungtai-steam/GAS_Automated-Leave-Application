*** Begin Patch
*** Add File: /Users/katungtai/Desktop/GAS_Automated Leave Application/README.md
+## GAS Automated Leave Application（Google Chat 事假申請機器人）
+
+此專案使用 Google Apps Script（V8 Runtime）建立一個 Google Chat App，讓學生在聊天室內填寫「事假申請」卡片表單，並把資料寫入指定的 Google Sheet。
+
+### 主要功能
+- **在 Google Chat 開啟表單**：使用者在聊天室輸入文字即可開啟「學生事假申請」卡片表單。
+- **表單資料寫入 Google Sheet**：送出後會把資料追加寫入試算表。
+- **時間欄位處理**
+  - **事假日期**：以日曆元件選擇日期。
+  - **請假時間**：
+    - 可選 **全日** 或 **時段**。
+    - 若選「時段」，以節次下拉選「時段開始 / 時段完結」。
+    - 寫入試算表時，會自動換算為實際時間段（例如 `09:00-10:30`），若為全日則寫入 `全日`。
+  - **離校時間**：由「時段完結」自動推算節次完結時間（例如第3節完結 → `10:30`）。
+- **原因選單**：提供常見原因下拉選擇；選「其他」時才允許填寫「原因（其他）」。
+- **文件情況自動記錄**
+  - 送出表單時，試算表的「文件情況」預設寫入 `需補交`。
+  - 若學生在送出後於同一聊天室上傳/拍照圖片，系統會自動把「最新一筆申請」的「文件情況」更新為 `有相關文件`。
+- **批核者自動帶入**：以事件中的 Gmail 帳號使用者名稱（`@` 前的字串）取得，寫入試算表「批核者」欄位。
+
+### 試算表欄位（`LEAVE_SHEET_HEADERS_`）
+寫入欄位順序如下：
+- 申請時間
+- 班別
+- 學號
+- 姓名
+- 事假日期
+- 請假時間
+- 離校時間
+- 原因
+- 文件情況
+- 批核者
+
+### 主要檔案
+- `ChatBot.gs`：Google Chat App 主程式（事件入口、卡片表單、寫入 Sheet、附件更新文件情況）。
+- `appsscript.json`：Apps Script 專案設定（時區、Runtime）。
+
+### 部署/設定重點
+- 在 `ChatBot.gs` 設定試算表 ID：
+  - `LEAVE_SHEET_ID_`：請填入你的 Google Sheet ID。
+- Google Chat App 部署後，讓使用者在聊天室與機器人互動即可使用。
+
*** End Patch

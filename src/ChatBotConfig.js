/**
 * 設定常數與選項（ChatBotConfig.js）
 */

/**
 * Google Chat Bot：學生事假申請（卡片表單）
 *
 * 使用方式：
 * - 在聊天室輸入任意文字（或輸入「請假」）即可開啟表單
 * - 填完按「送出」寫入 Google Sheet
 */

// 請假紀錄試算表 ID（網址中 /d/<ID>/ 的那段）
const SPREADSHEET_ID_ = '1W2lQmEH9395IpywwjHaRMJ2ft625vR28EkbbnlXNmC4';
const LEAVE_SHEET_NAME_ = 'Record'; // 事假申請寫入的工作表；留空則用試算表第一個工作表
const LEAVE_SHEET_HEADERS_ = [
  '申請時間',
  '班別',
  '學號',
  '姓名',
  '請假類型',
  '事假日期(開始)',
  '事假日期(結束)',
  '請假時間(開始)',
  '請假時間(結束)',
  '離校時間',
  '原因',
  '文件情況',
  '批核者',
  '請假單',
];

/**
 * Google Doc 請假單範本：Drive 檔案 ID（網址 /document/d/<ID>/edit）；副本資料夾 ID 可選。
 * 範本留 YOUR_LEAVE_DOC_TEMPLATE_ID 則不產生文件。資料夾留 YOUR_* 或空白時，副本會放在「與範本相同資料夾」或 My Drive 根目錄（不依賴 getFolderById）。
 *
 * 範本內請置入（與下列字元完全一致）：
 * {{Name}} {{Class}} {{StudentId}} {{Reason}} {{ApplyDate}} {{DocumentStatus}}
 * {{CheckRange}} {{CheckSlot}} {{LeaveRangeSentence}} {{LeaveSlotSentence}}
 * {{LeaveDate}} {{LeaveTime}} {{exitTime}}（空白句見 LEAVE_DOC_BLANK_*）
 */
const LEAVE_DOC_TEMPLATE_ID_ = '1ZEC68X0J5cUElAnl5_83_xoz3x80Mhu3dPR0n6T7F24';
const LEAVE_DOC_OUTPUT_FOLDER_ID_ = '1f3inCMDSYc1pl2dEJDCShxW__9d8GcD-';

// 未選該類請假時仍寫入 Doc，保留與紙本相同版位（避免整段空白）
const LEAVE_DOC_BLANK_SLOT_SENTENCE_ = '＿＿月＿＿日  （時間︰__________________）早退。';
const LEAVE_DOC_BLANK_RANGE_SENTENCE_ =
  '＿＿月＿＿日（上午／下午）至＿＿月＿＿日（上午／下午）告假。';

// 學生名冊專用試算表（老師代學生提交時選取學生）
const ROSTER_SPREADSHEET_ID_ = '1ts48CZDryrWelCjlqnpeeGfJNfWfPcqQ8XSVQg1ek0M';
const ROSTER_SHEET_NAME_ = ''; // 留空則用試算表第一個工作表
// 名冊欄位名稱（名冊第一列的標題）
const ROSTER_HEADERS_ = {
  className: 'Class',
  studentId: 'No.',
  name: 'Chinese Name',
};
// 若同一班別學生較多，請把這個數字調小避免卡片過大（超過上限時下拉會停用，需調高或拆分名冊）
const ROSTER_MAX_STUDENTS_PER_CLASS_ = 35;
const ROSTER_CACHE_TTL_SECONDS_ = 15 * 60; // 15 分鐘
// 名冊快取 key 版本：當排序/解析邏輯變更時請遞增，避免舊快取造成「看起來沒更新」
const ROSTER_CACHE_VERSION_ = 5;

/** 開啟請假紀錄試算表 */
function openMainSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID_);
}

/** 開啟學生名冊試算表 */
function openRosterSpreadsheet_() {
  return SpreadsheetApp.openById(ROSTER_SPREADSHEET_ID_);
}

// 固定/常用選項（可依學校實際情況修改）
const CLASS_OPTIONS_ = buildClassOptions_(6, ['A', 'B', 'C', 'D']); // 1A ~ 6D（6級、每級4班）
// 請假類型（三選一）：切換後請按表單內選項變更，或改選類型後會自動重整欄位
const LEAVE_CATEGORY_OPTIONS_ = [
  { text: '1. 一天時段', value: 'day_slots' },
  { text: '2. 半天(上午)／半天(下午)／全天(一天)', value: 'half_full_day' },
  { text: '3. 全天（日期區間）', value: 'full_day_range' },
];
const HALF_FULL_DAY_SUBOPTIONS_ = [
  { text: '半天(上午)', value: 'am' },
  { text: '半天(下午)', value: 'pm' },
  { text: '全天(一天)', value: 'full' },
];
// 第 2 類寫入試算表之鐘點（請依學校鐘聲表與 SCHOOL_TIMESLOT_OPTIONS_ 對齊調整）
const HALF_FULL_DAY_CLOCK_ = {
  am: { start: '08:10', end: '12:10' },
  pm: { start: '13:20', end: '15:40' },
  full: { start: '08:10', end: '15:40' },
};
const REASON_OPTIONS_ = ['病假', '家事', '覆診/醫療', '比賽/活動', '面試', '其他'];
const DOCUMENT_STATUS_HAS_FILE_ = '有相關文件';
const DOCUMENT_STATUS_NEED_SUBMIT_ = '需補交';
// 上學時段（可依學校鐘聲表調整）
const SCHOOL_TIMESLOT_OPTIONS_ = [
  { text: '第1節（08:10-08:50）', value: '1', startTime: '08:10', endTime: '08:50' },
  { text: '第2節（09:00-09:40）', value: '2', startTime: '09:00', endTime: '09:40' },
  { text: '第3節（09:50-10:30）', value: '3', startTime: '09:50', endTime: '10:30' },
  { text: '第4節（10:40-11:20）', value: '4', startTime: '10:40', endTime: '11:20' },
  { text: '第5節（11:30-12:10）', value: '5', startTime: '11:30', endTime: '12:10' },
  { text: '第6節（13:20-14:00）', value: '6', startTime: '13:20', endTime: '14:00' },
  { text: '第7節（14:10-14:50）', value: '7', startTime: '14:10', endTime: '14:50' },
  { text: '第8節（15:00-15:40）', value: '8', startTime: '15:00', endTime: '15:40' },
];

function buildClassOptions_(gradeCount, classLetters) {
  const grades = Math.max(1, Number(gradeCount) || 1);
  const letters = Array.isArray(classLetters) && classLetters.length ? classLetters : ['A', 'B', 'C', 'D'];
  const out = [];
  for (let g = 1; g <= grades; g++) {
    for (let i = 0; i < letters.length; i++) out.push(`${g}${letters[i]}`.trim());
  }
  return out;
}

// --- 工作記錄（Work Log）---
/** 工作記錄專用試算表 ID（與請假/名冊/校服儀容分開） */
const WORK_LOG_SPREADSHEET_ID_ = '1h33T3VRMaD0_4x_dLsXWpyH26w0AUYgFqPewf3N7xnU';
/** 工作表名稱；留空則用試算表第一個工作表（gid=0） */
const WORK_LOG_SHEET_NAME_ = '';
const WORK_LOG_SHEET_HEADERS_ = [
  '日期',
  '時間',
  '班別',
  '學生姓名',
  '違規類別',
  '處理等級',
  '事件詳情',
  '是否需發信',
  '跟進狀態',
  '原始完整描述',
];
/** 新紀錄預設跟進狀態 */
const WORK_LOG_DEFAULT_FOLLOW_UP_STATUS_ = '待跟進';
const WORK_LOG_NEED_EMAIL_OPTIONS_ = ['是', '否'];

/** Slash commands：請在 Google Chat API 設定相同 Command ID 與名稱 */
const SLASH_CMD_LEAVE_ID_ = 1;
const SLASH_CMD_WORKLOG_ID_ = 2;
const SLASH_CMD_MENU_ID_ = 3;
const SLASH_CMD_LEAVE_NAMES_ = ['leave', '事假', '請假'];
const SLASH_CMD_WORKLOG_NAMES_ = ['worklog', '工作記錄', '違規'];
const SLASH_CMD_MENU_NAMES_ = ['menu', '選單', 'help', '幫助'];
/** Script Properties 中的 Gemini API Key 名稱（勿寫死在程式碼） */
const GEMINI_API_KEY_PROPERTY_ = 'GEMINI_API_KEY';
const GEMINI_MODEL_ = 'gemini-3.6-flash';
/** Gemini 分類時只能從下列選項擇一（可依校規修改） */
const WORK_LOG_VIOLATION_CATEGORIES_ = [
  '遲到/缺席',
  '儀容不整',
  '使用手機/電子設備',
  '欠交功課',
  '擾亂秩序',
  '欺凌/衝突',
  '其他',
];
const WORK_LOG_HANDLING_LEVELS_ = ['口頭警告', '書面警告', '記過/懲罰', '轉介/跟進', '其他'];

/** 開啟工作記錄試算表 */
function openWorkLogSpreadsheet_() {
  return SpreadsheetApp.openById(WORK_LOG_SPREADSHEET_ID_);
}

// --- 校服儀容記錄（獨立於工作記錄；表單整合待後續開發）---
/** 所有學生校服儀容總表試算表 ID */
const UNIFORM_RECORD_SPREADSHEET_ID_ = '1uYBJ1J2RACFfuPOhHHoPlzm1uckBN1d5KLoY0XmH7D4';
/** 依班別分流的校服儀容試算表（班別須與名冊 Class 一致，如 4A） */
const UNIFORM_RECORD_CLASS_SPREADSHEET_IDS_ = {
  '4A': '1g4nZTsu-Wrx4Vx4qwsGK2ahtKUTj6RyrzWvHmG5VnBQ',
  '4B': '1-83ELE2E6Eq6ER6qEbRJr2VyfLe6XTrjEAkD_shg5SQ',
  '4C': '1UNv34x4w0pL1S5N0jxJtKz1riblYzzVH1Ny7syMElN0',
  '4D': '1Ylya5couK452_5BPWHEsAQP7LBCLdi5knah_jiyuJ-U',
};
/** 工作表名稱；留空則用試算表第一個工作表 */
const UNIFORM_RECORD_SHEET_NAME_ = '';
const UNIFORM_RECORD_SHEET_HEADERS_ = [
  '違規日期',
  '違規時間',
  '班別',
  '學號',
  '姓名',
  '違規類型',
  '改善時間',
];

/** 開啟校服儀容總表試算表 */
function openUniformRecordSpreadsheet_() {
  return SpreadsheetApp.openById(UNIFORM_RECORD_SPREADSHEET_ID_);
}

// --- 班主任聯絡（校服儀容新記錄電郵通知）---
/** 班主任 Gmail 聯絡表試算表 ID */
const HOMEROOM_CONTACT_SPREADSHEET_ID_ = '1HRA6FgIy3ykEN9SLEWA55OmKNOQ1rErAEPjDDfUQ7Ag';
/** 工作表名稱；留空則用第一個工作表 */
const HOMEROOM_CONTACT_SHEET_NAME_ = '';
/** 班主任聯絡表第一列標題（班別、Initial、姓名、gmail） */
const HOMEROOM_CONTACT_HEADERS_ = {
  className: '班別',
  initial: 'Initial',
  name: '姓名',
  email: 'gmail',
};
const HOMEROOM_CONTACT_CACHE_TTL_SECONDS_ = 15 * 60;
const HOMEROOM_CONTACT_CACHE_VERSION_ = 4;
/** 各班試算表有新記錄時是否自動電郵班主任 */
const UNIFORM_RECORD_NOTIFY_EMAIL_ENABLED_ = true;

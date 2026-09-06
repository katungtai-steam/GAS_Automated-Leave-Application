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
  '已列印', // O 欄：手動標記是否已列印請假表
];
/** 「已列印」欄視為已完成列印的值（其餘／空白＝未列印） */
const LEAVE_PRINTED_TRUE_VALUES_ = ['是', 'Y', 'y', '✓', '✔', '已列印', 'TRUE', 'true', '1'];

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
/** 工作記錄專用試算表 ID（與請假/名冊分開） */
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

/**
 * Slash commands 唯一來源（請與 Google Chat API → Configuration 一致）
 *
 * - id：Console 的 Command ID（整數）
 * - name：Console 的 Name（不含前導 `/`；Console 填寫時要加 `/`）
 * - aliases：程式另接受的別名（文字 `/別名` 或 commandName）；不必在 Console 再登記
 * - description：說明文字（可填到 Console Description）
 * - action：路由鍵（leave | worklog | yellow | menu）
 *
 * Console 請只建下列 4 筆（不要建別名當獨立指令，以免 ID 對不上）：
 *   1 → /事假 、 2 → /工作記錄 、 3 → /黃紙 、 4 → /選單
 */
const SLASH_COMMANDS_ = [
  {
    id: 1,
    name: '事假',
    aliases: ['leave', '請假'],
    description: '開啟事假申請表單',
    action: 'leave',
  },
  {
    id: 2,
    name: '工作記錄',
    aliases: ['worklog', '違規'],
    description: '開啟工作記錄表單',
    action: 'worklog',
  },
  {
    id: 3,
    name: '黃紙',
    aliases: ['yellowslip', '黃紙跟進'],
    description: '開啟黃紙跟進',
    action: 'yellow',
  },
  {
    id: 4,
    name: '選單',
    aliases: ['menu', 'help', '幫助'],
    description: '開啟主選單',
    action: 'menu',
  },
];
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

// --- 黃紙跟進（Yellow Slip）---
/** 黃紙紀錄試算表 ID */
const YELLOW_SLIP_SPREADSHEET_ID_ = '1yYWXMhqRdDKRzQgfopaTCC98sSXfylIJTzZ90_t-ulg';
/** 工作表名稱；留空則用試算表第一個工作表（gid=0） */
const YELLOW_SLIP_SHEET_NAME_ = '';
/**
 * A–F：黃紙紀錄；O–T：各角色跟進（角色欄 + 備註欄成對）
 * 欄位索引為 0-based（對應試算表欄）
 */
const YELLOW_SLIP_COLS_ = {
  className: 0, // A Class
  classNo: 1, // B ClassNo
  name: 2, // C Name
  itemTaken: 3, // D ItemTaken
  by: 4, // E By
  dateTime: 5, // F DateTime
  classTeacher: 14, // O 班主任
  classTeacherRemark: 15, // P 備註
  gradeDiscipline: 16, // Q 級訓導
  gradeDisciplineRemark: 17, // R 備註
  disciplineMaster: 18, // S 訓導主任
  disciplineMasterRemark: 19, // T 備註
};
/** 讀取範圍最右欄（T = 20 欄） */
const YELLOW_SLIP_LAST_COL_ = 20;
/** 卡片一次最多列出幾筆黃紙 */
const YELLOW_SLIP_MAX_LIST_ = 12;
/** 級訓導跟進下拉選項（寫入「級訓導」欄） */
const YELLOW_SLIP_GRADE_DISCIPLINE_OPTIONS_ = [
  '未跟進',
  '處理中',
  '已跟進',
  '已完結',
];
/** 篩選：全部／待級訓導跟進／任一角色待跟進 */
const YELLOW_SLIP_FILTER_ALL_ = 'all';
const YELLOW_SLIP_FILTER_PENDING_GRADE_ = 'pending_grade';
const YELLOW_SLIP_FILTER_PENDING_ANY_ = 'pending_any';

/** 開啟黃紙紀錄試算表 */
function openYellowSlipSpreadsheet_() {
  return SpreadsheetApp.openById(YELLOW_SLIP_SPREADSHEET_ID_);
}

// --- 每天通知（上學天 Digest → Google Chat）---
/**
 * 通知目標空間 name（例如 spaces/AAAA...）。
 * 留空則使用 Script Properties「DAILY_DIGEST_CHAT_SPACE」
 * （Bot 加入空間、或在空間內說「設定每日提醒」時會寫入）。
 *
 * 更簡易：在 Chat 空間建立 Incoming webhook，把 URL 填到
 * DAILY_DIGEST_CHAT_WEBHOOK_URL_（或 Script Property DAILY_DIGEST_CHAT_WEBHOOK）。
 */
const DAILY_DIGEST_CHAT_SPACE_NAME_ = 'spaces/AAQAnqcLNHc';
/** Incoming Webhook URL（優先於空間 ID；留空則改用 Chat API + 空間） */
const DAILY_DIGEST_CHAT_WEBHOOK_URL_ =
  'https://chat.googleapis.com/v1/spaces/AAQAnqcLNHc/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=vL1o0DpONsTq-nh7GTD2xEEbQ-QBWiZhimdu7toYe4I';
/** Script Properties key：記住的 Chat 空間 */
const DAILY_DIGEST_CHAT_SPACE_PROP_ = 'DAILY_DIGEST_CHAT_SPACE';
/** Script Properties key：Webhook URL */
const DAILY_DIGEST_CHAT_WEBHOOK_PROP_ = 'DAILY_DIGEST_CHAT_WEBHOOK';
/** 是否啟用每天通知 */
const DAILY_DIGEST_ENABLED_ = true;
/** 觸發小時（Asia/Hong_Kong，0–23） */
const DAILY_DIGEST_HOUR_ = 8;
/** 摘要最多列出幾筆未列印事假／待跟進黃紙 */
const DAILY_DIGEST_MAX_LEAVE_ITEMS_ = 25;
const DAILY_DIGEST_MAX_YELLOW_ITEMS_ = 25;
/**
 * 香港公眾假期（yyyy-MM-dd）。上學天 = 週一至週五且不在此清單。
 * 可按學年增補；亦可在 Extra 陣列加入學校假期。
 */
const HK_PUBLIC_HOLIDAYS_ = [
  // 2026
  '2026-01-01',
  '2026-02-17',
  '2026-02-18',
  '2026-02-19',
  '2026-04-03',
  '2026-04-04',
  '2026-04-06',
  '2026-04-07',
  '2026-05-01',
  '2026-05-25',
  '2026-06-19',
  '2026-07-01',
  '2026-09-26',
  '2026-10-01',
  '2026-10-19',
  '2026-12-25',
  '2026-12-26',
  // 2027
  '2027-01-01',
  '2027-02-06',
  '2027-02-08',
  '2027-02-09',
  '2027-03-26',
  '2027-03-27',
  '2027-03-29',
  '2027-04-05',
  '2027-05-01',
  '2027-05-13',
  '2027-06-09',
  '2027-07-01',
  '2027-09-16',
  '2027-10-01',
  '2027-10-08',
  '2027-12-25',
  '2027-12-27',
];
/** 額外非上學日（學校假期等），格式 yyyy-MM-dd */
const SCHOOL_EXTRA_NON_SCHOOL_DAYS_ = [];
/** 級訓導欄視為「尚未處理」的值 */
const YELLOW_SLIP_PENDING_GRADE_VALUES_ = ['', '未跟進'];

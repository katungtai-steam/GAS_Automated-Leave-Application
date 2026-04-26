const YOUR_SHEET_ID = 'YOUR_SHEET_ID';
const YOUR_DOC_TEMPLATE_ID = 'YOUR_DOC_TEMPLATE_ID';
const YOUR_FOLDER_ID = 'YOUR_FOLDER_ID';

const SHEET_HEADERS = [
  'Timestamp',
  '申請日期',
  '班別',
  '學號',
  '姓名',
  '事假日期',
  '原因',
  '離校時間',
  '文件情況',
  '文件連結',
];

const QA_FIELDS = [
  { key: 'name', label: '姓名', prompt: '請輸入【姓名】' },
  { key: 'className', label: '班別', prompt: '請輸入【班別】（例如：3A）' },
  { key: 'leaveDate', label: '事假日期', prompt: '請輸入【事假日期】（例如：2026/04/27）' },
  { key: 'reason', label: '原因', prompt: '請輸入【原因】（可含空白）' },
  { key: 'leaveTime', label: '離校時間', prompt: '請輸入【離校時間】（例如：14:30）' },
  { key: 'documentStatus', label: '文件情況', prompt: '請輸入【文件情況】（例如：已交家長信 / 待補）' },
];

function doPost(e) {
  try {
    const event = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    const msgText = ((event.message && event.message.text) || '').trim();
    if (!msgText) return chatText_('我目前只處理文字訊息。');

    const userKey = getUserKey_(event);
    const state = loadState_(userKey);

    if (/^(重置|reset|restart)$/i.test(msgText)) {
      clearState_(userKey);
      return chatText_('已重置。你可以直接輸入一行格式，或輸入「請假」開始問答。');
    }

    if (state && state.mode === 'qa' && state.stepIndex != null) {
      return handleQaAnswer_(userKey, state, msgText);
    }

    if (/^(請假|開始|start)$/i.test(msgText)) {
      const newState = { mode: 'qa', stepIndex: 0, data: {} };
      saveState_(userKey, newState);
      return chatText_(
        '好的，我會用問答方式收集請假資訊。\n\n' +
          QA_FIELDS[0].prompt +
          '\n\n（隨時輸入「重置」可重新開始；或直接貼上一行格式也可以。）'
      );
    }

    const parsed = parseOneLine_(msgText);
    if (parsed) {
      const result = persistAndGenerate_(parsed);
      return chatText_(`已成功記錄並生成文件：${result.docUrl}`);
    }

    return chatText_(
      '我可以用兩種方式收集請假資訊：\n' +
        '1) 輸入「請假」進入問答\n' +
        '2) 直接貼上一行格式：\n' +
        '   申請日期 班別 學號 姓名 事假日期 原因 離校時間 文件情況\n\n' +
        '例：2026/04/26 3A 1234 王小明 2026/04/27 腸胃不適 14:30 已交家長信'
    );
  } catch (err) {
    return chatText_('處理時發生錯誤，請稍後再試或輸入「重置」。');
  }
}

function handleQaAnswer_(userKey, state, answerText) {
  const idx = state.stepIndex;
  const field = QA_FIELDS[idx];

  state.data = state.data || {};
  state.data[field.key] = answerText;

  const nextIdx = idx + 1;
  if (nextIdx < QA_FIELDS.length) {
    state.stepIndex = nextIdx;
    saveState_(userKey, state);
    return chatText_(QA_FIELDS[nextIdx].prompt);
  }

  const now = new Date();
  const data = {
    applyDate: formatDate_(now),
    className: state.data.className || '',
    studentId: '',
    name: state.data.name || '',
    leaveDate: state.data.leaveDate || '',
    reason: state.data.reason || '',
    leaveTime: state.data.leaveTime || '',
    documentStatus: state.data.documentStatus || '',
  };

  const result = persistAndGenerate_(data);
  clearState_(userKey);
  return chatText_(`已成功記錄並生成文件：${result.docUrl}`);
}

function parseOneLine_(text) {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length < 8) return null;

  const applyDate = tokens[0];
  const className = tokens[1];
  const studentId = tokens[2];
  const name = tokens[3];
  const leaveDate = tokens[4];

  const leaveTime = tokens[tokens.length - 2];
  const documentStatus = tokens[tokens.length - 1];

  const reasonTokens = tokens.slice(5, tokens.length - 2);
  const reason = reasonTokens.join(' ').trim();

  if (!applyDate || !className || !studentId || !name || !leaveDate || !leaveTime || !documentStatus) return null;

  return { applyDate, className, studentId, name, leaveDate, reason, leaveTime, documentStatus };
}

function persistAndGenerate_(data) {
  const ss = SpreadsheetApp.openById(YOUR_SHEET_ID);
  const sheet = ss.getSheets()[0];

  ensureHeaders_(sheet);

  const docFile = generateDocFromTemplate_(data);
  const docUrl = docFile.getUrl();

  sheet.appendRow([
    new Date(),
    data.applyDate || '',
    data.className || '',
    data.studentId || '',
    data.name || '',
    data.leaveDate || '',
    data.reason || '',
    data.leaveTime || '',
    data.documentStatus || '',
    docUrl,
  ]);

  return { docUrl };
}

function ensureHeaders_(sheet) {
  const firstRow = sheet.getRange(1, 1, 1, SHEET_HEADERS.length).getValues()[0];
  const isEmpty = firstRow.every((v) => String(v || '').trim() === '');
  if (isEmpty) {
    sheet.getRange(1, 1, 1, SHEET_HEADERS.length).setValues([SHEET_HEADERS]);
  }
}

function generateDocFromTemplate_(data) {
  const folder = DriveApp.getFolderById(YOUR_FOLDER_ID);
  const template = DriveApp.getFileById(YOUR_DOC_TEMPLATE_ID);

  const fileName = `請假單_${data.className || ''}_${data.name || ''}_${String(data.leaveDate || '').replaceAll('/', '-')}`.trim();
  const newFile = template.makeCopy(fileName, folder);

  const doc = DocumentApp.openById(newFile.getId());
  const body = doc.getBody();

  const replacements = {
    '{{ApplyDate}}': data.applyDate || '',
    '{{Class}}': data.className || '',
    '{{StudentId}}': data.studentId || '',
    '{{Name}}': data.name || '',
    '{{LeaveDate}}': data.leaveDate || '',
    '{{Reason}}': data.reason || '',
    '{{LeaveTime}}': data.leaveTime || '',
    '{{DocumentStatus}}': data.documentStatus || '',
  };

  Object.keys(replacements).forEach((k) => body.replaceText(escapeForDocRegex_(k), replacements[k]));
  doc.saveAndClose();

  return newFile;
}

function escapeForDocRegex_(literal) {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function chatText_(text) {
  return ContentService.createTextOutput(JSON.stringify({ text })).setMimeType(ContentService.MimeType.JSON);
}

function getUserKey_(event) {
  const user = event.user || {};
  return user.name || user.email || 'unknown_user';
}

function loadState_(userKey) {
  const raw = PropertiesService.getScriptProperties().getProperty(`STATE_${userKey}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function saveState_(userKey, state) {
  PropertiesService.getScriptProperties().setProperty(`STATE_${userKey}`, JSON.stringify(state));
}

function clearState_(userKey) {
  PropertiesService.getScriptProperties().deleteProperty(`STATE_${userKey}`);
}

function formatDate_(d) {
  const tz = Session.getScriptTimeZone() || 'Asia/Taipei';
  return Utilities.formatDate(d, tz, 'yyyy/MM/dd');
}

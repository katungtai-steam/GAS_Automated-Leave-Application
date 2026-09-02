/**
 * 校服儀容：班主任電郵查詢與新記錄通知（UniformRecordNotifyService.js）
 */

function isHomeroomContactConfigured_() {
  return !!HOMEROOM_CONTACT_SPREADSHEET_ID_ && HOMEROOM_CONTACT_SPREADSHEET_ID_ !== 'YOUR_HOMEROOM_CONTACT_SPREADSHEET_ID';
}

function getHomeroomContactSheet_() {
  const ss = SpreadsheetApp.openById(HOMEROOM_CONTACT_SPREADSHEET_ID_);
  if (HOMEROOM_CONTACT_SHEET_NAME_) {
    const sheet = ss.getSheetByName(HOMEROOM_CONTACT_SHEET_NAME_);
    if (!sheet) throw new Error('找不到班主任聯絡工作表（HOMEROOM_CONTACT_SHEET_NAME_）。');
    return sheet;
  }
  const sheets = ss.getSheets();
  if (!sheets.length) throw new Error('班主任聯絡試算表沒有任何工作表。');
  return sheets[0];
}

function getHomeroomContactHeaderIndexMap_(headerRow) {
  const map = {};
  for (let i = 0; i < headerRow.length; i++) {
    const k = String(headerRow[i] || '').trim();
    if (k) map[k] = i;
  }
  return map;
}

function getHomeroomContactMissingHeaders_(headerIndexMap) {
  const missing = [];
  if (headerIndexMap[HOMEROOM_CONTACT_HEADERS_.className] == null) missing.push(HOMEROOM_CONTACT_HEADERS_.className);
  if (headerIndexMap[HOMEROOM_CONTACT_HEADERS_.email] == null) missing.push(HOMEROOM_CONTACT_HEADERS_.email);
  return missing;
}

/** 依班別彙整班主任 gmail（同班可有多列，例如 2 位班主任） */
function readHomeroomTeacherEmailMap_() {
  if (!isHomeroomContactConfigured_()) {
    return { ok: false, error: '尚未設定 HOMEROOM_CONTACT_SPREADSHEET_ID_。', map: {} };
  }

  const cache = CacheService.getScriptCache();
  const cacheKey = `homeroom:v${HOMEROOM_CONTACT_CACHE_VERSION_}:emailsByClass`;
  const cached = cache.get(cacheKey);
  if (cached) return { ok: true, map: JSON.parse(cached) };

  const sheet = getHomeroomContactSheet_();
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return { ok: true, map: {} };

  const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  const headerIndexMap = getHomeroomContactHeaderIndexMap_(values[0] || []);
  const missing = getHomeroomContactMissingHeaders_(headerIndexMap);
  if (missing.length) {
    return {
      ok: false,
      error: `班主任聯絡表缺少欄位：${missing.join('、')}（請確認第一列為：班別、Initial、姓名、gmail）`,
      map: {},
    };
  }

  const classIdx = headerIndexMap[HOMEROOM_CONTACT_HEADERS_.className];
  const emailIdx = headerIndexMap[HOMEROOM_CONTACT_HEADERS_.email];

  const map = {};
  for (let r = 1; r < values.length; r++) {
    const row = values[r];
    const className = normalizeUniformRecordClassName_(row[classIdx]);
    const email = String(row[emailIdx] || '').trim();
    if (!className || !email) continue;
    if (!map[className]) map[className] = [];
    if (map[className].indexOf(email) === -1) map[className].push(email);
  }

  cache.put(
    cacheKey,
    JSON.stringify(map),
    Math.max(60, Number(HOMEROOM_CONTACT_CACHE_TTL_SECONDS_) || 900)
  );
  return { ok: true, map };
}

function lookupHomeroomTeacherEmailsForClass_(className) {
  const key = normalizeUniformRecordClassName_(className);
  if (!key) return { ok: true, emails: [] };

  const snap = readHomeroomTeacherEmailMap_();
  if (!snap.ok) return { ok: false, error: snap.error, emails: [] };

  const emails = (snap.map && snap.map[key]) || [];
  return { ok: true, emails };
}

function formatUniformRecordTimeForEmail_(value) {
  if (value == null || value === '') return '';

  if (value instanceof Date && !isNaN(value.getTime())) {
    const tz = Session.getScriptTimeZone() || 'Asia/Hong_Kong';
    return Utilities.formatDate(value, tz, 'HH:mm:ss');
  }

  const s = String(value).trim();
  if (!s) return '';

  const timeOnly = s.match(/^(\d{1,2}:\d{2}(?::\d{2})?)$/);
  if (timeOnly) return timeOnly[1];

  const afterSpace = s.match(/\s(\d{1,2}:\d{2}(?::\d{2})?)$/);
  if (afterSpace) return afterSpace[1];

  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    const tz = Session.getScriptTimeZone() || 'Asia/Hong_Kong';
    return Utilities.formatDate(parsed, tz, 'HH:mm:ss');
  }

  return s;
}

function getUniformRecordClassSpreadsheetUrl_(className) {
  const spreadsheetId = getUniformRecordClassSpreadsheetId_(className);
  if (!spreadsheetId) return '';
  try {
    return SpreadsheetApp.openById(spreadsheetId).getUrl();
  } catch (e) {
    return 'https://docs.google.com/spreadsheets/d/' + spreadsheetId + '/edit';
  }
}

function buildUniformRecordEmailBody_(rowValues, className) {
  const headers = UNIFORM_RECORD_SHEET_HEADERS_;
  const lines = [`${className} 班有新的校服儀容違規記錄：`, ''];
  for (let i = 0; i < headers.length; i++) {
    const label = headers[i];
    let cell = String(rowValues[i] == null ? '' : rowValues[i]).trim();
    if (label === '違規時間') {
      cell = formatUniformRecordTimeForEmail_(rowValues[i]);
    }
    lines.push(`${label}：${cell}`);
  }

  const classSheetUrl = getUniformRecordClassSpreadsheetUrl_(className);
  lines.push('');
  if (classSheetUrl) {
    lines.push(`${className} 班試算表：${classSheetUrl}`);
  }
  lines.push('');
  lines.push('此電郵由校務系統自動發送，請勿直接回覆。');
  return lines.join('\n');
}

function uniformRecordEmailSentKey_(sig) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(sig || ''), Utilities.Charset.UTF_8);
  const hex = digest.map((b) => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
  return 'uniformMail:' + hex;
}

function isUniformRecordEmailAlreadySent_(sig) {
  return !!PropertiesService.getScriptProperties().getProperty(uniformRecordEmailSentKey_(sig));
}

function markUniformRecordEmailSent_(sig) {
  PropertiesService.getScriptProperties().setProperty(uniformRecordEmailSentKey_(sig), String(Date.now()));
}

/** 一班一封：同一封電郵寄給該班所有班主任（to 欄以逗號分隔） */
function sendUniformRecordEmailToClassTeachers_(recipients, className, rowValues) {
  const normalizedClass = normalizeUniformRecordClassName_(className);
  const unique = [];
  const seen = {};
  for (let i = 0; i < recipients.length; i++) {
    const email = String(recipients[i] || '').trim();
    if (!email || seen[email]) continue;
    seen[email] = true;
    unique.push(email);
  }
  if (!unique.length) return [];

  const studentName =
    UNIFORM_RECORD_SHEET_HEADERS_.indexOf('姓名') >= 0
      ? String(rowValues[UNIFORM_RECORD_SHEET_HEADERS_.indexOf('姓名')] || '').trim()
      : '';
  const subject = `[校服儀容] ${normalizedClass} 新違規記錄${studentName ? ' - ' + studentName : ''}`;
  const body = buildUniformRecordEmailBody_(rowValues, normalizedClass);

  MailApp.sendEmail({
    to: unique.join(','),
    subject,
    body,
  });
  return unique;
}

function notifyUniformRecordHomeroomTeachers_(className, rowValues) {
  try {
    if (!UNIFORM_RECORD_NOTIFY_EMAIL_ENABLED_) {
      return { ok: true, skipped: true, reason: '通知已關閉', emails: [] };
    }

    const normalizedClass = normalizeUniformRecordClassName_(className);
    if (!normalizedClass) {
      return { ok: false, error: '班別空白，無法發送電郵。', emails: [] };
    }

    const lookup = lookupHomeroomTeacherEmailsForClass_(normalizedClass);
    if (!lookup.ok) return { ok: false, error: lookup.error, emails: [] };
    if (!lookup.emails.length) {
      return {
        ok: false,
        error: `找不到 ${normalizedClass} 班主任電郵（請在聯絡表為此班別填至少一列 gmail）。`,
        emails: [],
      };
    }

    const sent = sendUniformRecordEmailToClassTeachers_(lookup.emails, normalizedClass, rowValues);
    return { ok: sent.length > 0, emails: sent };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e || '未知錯誤'), emails: [] };
  }
}

function notifyHomeroomTeacherForUniformRecord_(className, rowValues) {
  const result = notifyUniformRecordHomeroomTeachers_(className, rowValues);
  if (result.ok && result.emails && result.emails.length) {
    return { ok: true, email: result.emails.join(', ') };
  }
  if (result.skipped) return result;
  return { ok: false, error: result.error || '發送電郵失敗。' };
}

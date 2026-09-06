/**
 * 黃紙紀錄試算表讀寫（YellowSlipSheetService.js）
 * A–F：黃紙；O–T：班主任／級訓導／訓導主任跟進與備註
 */

function isYellowSlipConfigured_() {
  return !!YELLOW_SLIP_SPREADSHEET_ID_ && YELLOW_SLIP_SPREADSHEET_ID_ !== 'YOUR_YELLOW_SLIP_SPREADSHEET_ID';
}

function getYellowSlipSheet_() {
  const ss = openYellowSlipSpreadsheet_();
  if (YELLOW_SLIP_SHEET_NAME_) {
    const sheet = ss.getSheetByName(YELLOW_SLIP_SHEET_NAME_);
    if (!sheet) throw new Error('找不到黃紙工作表（YELLOW_SLIP_SHEET_NAME_）。');
    return sheet;
  }
  const sheets = ss.getSheets();
  if (!sheets.length) throw new Error('黃紙試算表沒有任何工作表。');
  return sheets[0];
}

function formatYellowSlipCell_(value) {
  if (value == null || value === '') return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone() || 'Asia/Hong_Kong', 'yyyy/MM/dd HH:mm');
  }
  return String(value).trim();
}

function normalizeYellowSlipClassName_(className) {
  return String(className || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function rowToYellowSlipRecord_(rowValues, sheetRow) {
  const c = YELLOW_SLIP_COLS_;
  return {
    sheetRow: sheetRow,
    className: formatYellowSlipCell_(rowValues[c.className]),
    classNo: formatYellowSlipCell_(rowValues[c.classNo]),
    name: formatYellowSlipCell_(rowValues[c.name]),
    itemTaken: formatYellowSlipCell_(rowValues[c.itemTaken]),
    by: formatYellowSlipCell_(rowValues[c.by]),
    dateTime: formatYellowSlipCell_(rowValues[c.dateTime]),
    classTeacher: formatYellowSlipCell_(rowValues[c.classTeacher]),
    classTeacherRemark: formatYellowSlipCell_(rowValues[c.classTeacherRemark]),
    gradeDiscipline: formatYellowSlipCell_(rowValues[c.gradeDiscipline]),
    gradeDisciplineRemark: formatYellowSlipCell_(rowValues[c.gradeDisciplineRemark]),
    disciplineMaster: formatYellowSlipCell_(rowValues[c.disciplineMaster]),
    disciplineMasterRemark: formatYellowSlipCell_(rowValues[c.disciplineMasterRemark]),
  };
}

function isYellowSlipPendingGrade_(record) {
  return !String((record && record.gradeDiscipline) || '').trim();
}

/**
 * 讀取黃紙紀錄（可依班別／待級訓導跟進篩選）
 * @returns {{ ok: boolean, error?: string, records?: Array, truncated?: boolean, totalMatched?: number }}
 */
function listYellowSlipRecords_(options) {
  try {
    if (!isYellowSlipConfigured_()) {
      return { ok: false, error: '尚未設定 YELLOW_SLIP_SPREADSHEET_ID_。', records: [] };
    }

    const classFilter = normalizeYellowSlipClassName_((options && options.className) || '');
    const filterMode = String((options && options.filterMode) || YELLOW_SLIP_FILTER_ALL_).trim();
    const maxList = Math.max(1, Number((options && options.maxList) || YELLOW_SLIP_MAX_LIST_) || 12);

    const sheet = getYellowSlipSheet_();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return { ok: true, records: [], truncated: false, totalMatched: 0 };
    }

    const values = sheet.getRange(2, 1, lastRow, YELLOW_SLIP_LAST_COL_).getValues();
    const matched = [];
    for (let i = 0; i < values.length; i++) {
      const rec = rowToYellowSlipRecord_(values[i], i + 2);
      if (!rec.className && !rec.name && !rec.dateTime) continue;
      if (classFilter && normalizeYellowSlipClassName_(rec.className) !== classFilter) continue;
      if (filterMode === YELLOW_SLIP_FILTER_PENDING_GRADE_ && !isYellowSlipPendingGrade_(rec)) continue;
      matched.push(rec);
    }

    const truncated = matched.length > maxList;
    return {
      ok: true,
      records: truncated ? matched.slice(0, maxList) : matched,
      truncated: truncated,
      totalMatched: matched.length,
    };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e || '未知錯誤'), records: [] };
  }
}

/** 試算表中出現過的班別（由 A 欄去重） */
function getYellowSlipDistinctClasses_() {
  try {
    if (!isYellowSlipConfigured_()) {
      return { ok: false, error: '尚未設定 YELLOW_SLIP_SPREADSHEET_ID_。', classes: [] };
    }
    const sheet = getYellowSlipSheet_();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { ok: true, classes: [] };

    const col = sheet.getRange(2, YELLOW_SLIP_COLS_.className + 1, lastRow, YELLOW_SLIP_COLS_.className + 1).getValues();
    const seen = {};
    const out = [];
    for (let i = 0; i < col.length; i++) {
      const t = String(col[i][0] || '').trim();
      if (!t || seen[t]) continue;
      seen[t] = true;
      out.push(t);
    }
    out.sort(function (a, b) {
      return String(a).localeCompare(String(b), 'zh-Hant');
    });
    return { ok: true, classes: out };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e || '未知錯誤'), classes: [] };
  }
}

function getYellowSlipRecordByRow_(sheetRow) {
  try {
    const r = Number(sheetRow);
    if (!r || r < 2) return { ok: false, error: '列號無效。' };
    if (!isYellowSlipConfigured_()) {
      return { ok: false, error: '尚未設定 YELLOW_SLIP_SPREADSHEET_ID_。' };
    }
    const sheet = getYellowSlipSheet_();
    if (r > sheet.getLastRow()) return { ok: false, error: '找不到該列黃紙紀錄。' };
    const rowValues = sheet.getRange(r, 1, r, YELLOW_SLIP_LAST_COL_).getValues()[0];
    return { ok: true, record: rowToYellowSlipRecord_(rowValues, r) };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e || '未知錯誤') };
  }
}

/**
 * 級訓導跟進：寫入 Q（級訓導）與 R（備註）
 */
function updateYellowSlipGradeDiscipline_(sheetRow, followUpText, remark) {
  try {
    const r = Number(sheetRow);
    if (!r || r < 2) return { ok: false, error: '列號無效。' };
    if (!isYellowSlipConfigured_()) {
      return { ok: false, error: '尚未設定 YELLOW_SLIP_SPREADSHEET_ID_。' };
    }
    const followUp = String(followUpText || '').trim();
    if (!followUp) return { ok: false, error: '請選擇級訓導跟進選項。' };

    const ss = openYellowSlipSpreadsheet_();
    const sheet = getYellowSlipSheet_();
    if (r > sheet.getLastRow()) return { ok: false, error: '找不到該列黃紙紀錄。' };

    const c = YELLOW_SLIP_COLS_;
    sheet.getRange(r, c.gradeDiscipline + 1).setValue(followUp);
    sheet.getRange(r, c.gradeDisciplineRemark + 1).setValue(String(remark || '').trim());

    return {
      ok: true,
      spreadsheetUrl: ss.getUrl(),
      row: r,
      record: getYellowSlipRecordByRow_(r).record,
    };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e || '未知錯誤') };
  }
}

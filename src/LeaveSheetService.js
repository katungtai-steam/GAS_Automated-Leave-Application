/**
 * 試算表讀寫（LeaveSheetService.js）
 */

function updateLeaveFormUrlByRow_(row, url) {
  try {
    const r = Number(row);
    if (!r || r < 2 || !String(url || '').trim()) return { ok: false, error: '參數無效。' };

    const ss = openMainSpreadsheet_();
    const sheet = LEAVE_SHEET_NAME_ ? ss.getSheetByName(LEAVE_SHEET_NAME_) : ss.getSheets()[0];
    if (!sheet) return { ok: false, error: '找不到指定的工作表（LEAVE_SHEET_NAME_）。' };

    const hi = LEAVE_SHEET_HEADERS_.indexOf('請假單');
    if (hi === -1) return { ok: false, error: '找不到「請假單」欄位。' };

    sheet.getRange(r, hi + 1).setValue(String(url).trim());
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e || '未知錯誤') };
  }
}

/** 回傳「\\n- 試算表：URL」；無法取得時為空字串 */
function trySpreadsheetBulletLine_() {
  try {
    if (SPREADSHEET_ID_ && SPREADSHEET_ID_ !== 'YOUR_SPREADSHEET_ID') {
      return '\n- 試算表：' + openMainSpreadsheet_().getUrl();
    }
  } catch (e) {}
  return '';
}

function appendLeaveToSheet_(data) {
  try {
    if (!SPREADSHEET_ID_ || SPREADSHEET_ID_ === 'YOUR_SPREADSHEET_ID') {
      return { ok: false, error: '尚未設定 SPREADSHEET_ID_（請填入請假紀錄試算表的 ID）。' };
    }

    const ss = openMainSpreadsheet_();
    const sheet = LEAVE_SHEET_NAME_ ? ss.getSheetByName(LEAVE_SHEET_NAME_) : ss.getSheets()[0];
    if (!sheet) return { ok: false, error: '找不到指定的工作表（LEAVE_SHEET_NAME_）。' };

    ensureLeaveSheetHeaders_(sheet, LEAVE_SHEET_HEADERS_);
    sheet.appendRow([
      data.submittedAt || new Date(),
      data.className || '',
      data.studentId || '',
      data.name || '',
      data.leaveTypeLabel || '',
      data.leaveDateStart || '',
      data.leaveDateEnd || '',
      data.leaveTimeStart || '',
      data.leaveTimeEnd || '',
      data.exitTime || '',
      data.reason || '',
      data.documentStatus || '',
      data.approver || '',
      data.leaveFormRef != null && data.leaveFormRef !== undefined ? data.leaveFormRef : '',
      '', // 已列印：預設空白（未列印）
    ]);

    const row = sheet.getLastRow();
    return { ok: true, spreadsheetUrl: ss.getUrl(), row };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e || '未知錯誤') };
  }
}

function ensureLeaveSheetHeaders_(sheet, headers) {
  const width = Math.max(headers.length, sheet.getLastColumn() || 1, 1);
  const firstRow = sheet.getRange(1, 1, 1, width).getValues()[0];
  const isEmpty = firstRow.every((v) => String(v || '').trim() === '');
  if (isEmpty) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }
  for (let i = 0; i < headers.length; i++) {
    if (String(firstRow[i] || '').trim() === '') {
      sheet.getRange(1, i + 1).setValue(headers[i]);
    }
  }
}

function getLeaveSheet_() {
  const ss = openMainSpreadsheet_();
  const sheet = LEAVE_SHEET_NAME_ ? ss.getSheetByName(LEAVE_SHEET_NAME_) : ss.getSheets()[0];
  if (!sheet) throw new Error('找不到指定的工作表（LEAVE_SHEET_NAME_）。');
  return sheet;
}

function buildLeaveHeaderIndexMap_(headerRow) {
  const map = {};
  for (let i = 0; i < headerRow.length; i++) {
    const key = String(headerRow[i] || '').trim();
    if (key && map[key] == null) map[key] = i;
  }
  return map;
}

function formatLeaveSheetCell_(value) {
  if (value == null || value === '') return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone() || 'Asia/Hong_Kong', 'yyyy/MM/dd');
  }
  return String(value).trim();
}

function formatLeaveDateRangeText_(startVal, endVal) {
  const start = formatLeaveSheetCell_(startVal);
  const end = formatLeaveSheetCell_(endVal);
  if (start && end && start !== end) return start + '～' + end;
  return start || end || '（日期未填）';
}

function isLeavePrintedValue_(value) {
  const t = String(value == null ? '' : value).trim();
  if (!t) return false;
  const list = LEAVE_PRINTED_TRUE_VALUES_ || [];
  for (let i = 0; i < list.length; i++) {
    if (t === String(list[i])) return true;
  }
  return false;
}

/**
 * 讀取未列印的事假申請（O 欄「已列印」空白／非已列印值）
 * @returns {{ ok: boolean, error?: string, records?: Array, truncated?: boolean, totalMatched?: number }}
 */
function listUnprintedLeaveRecords_(options) {
  try {
    if (!SPREADSHEET_ID_ || SPREADSHEET_ID_ === 'YOUR_SPREADSHEET_ID') {
      return { ok: false, error: '尚未設定 SPREADSHEET_ID_。', records: [] };
    }

    const maxList = Math.max(1, Number((options && options.maxList) || DAILY_DIGEST_MAX_LEAVE_ITEMS_) || 25);
    const sheet = getLeaveSheet_();
    const lastRow = sheet.getLastRow();
    const lastCol = Math.max(sheet.getLastColumn(), LEAVE_SHEET_HEADERS_.length);
    if (lastRow < 2) {
      return { ok: true, records: [], truncated: false, totalMatched: 0 };
    }

    const headerRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const idx = buildLeaveHeaderIndexMap_(headerRow);
    const printedCol = idx['已列印'];
    if (printedCol == null) {
      return { ok: false, error: '找不到「已列印」欄位（請確認 O 欄標題）。', records: [] };
    }

    const col = function (name, fallback) {
      return idx[name] != null ? idx[name] : fallback;
    };
    const cClass = col('班別', 1);
    const cId = col('學號', 2);
    const cName = col('姓名', 3);
    const cType = col('請假類型', 4);
    const cStart = col('事假日期(開始)', 5);
    const cEnd = col('事假日期(結束)', 6);
    const cReason = col('原因', 10);
    const cDoc = col('文件情況', 11);

    const values = sheet.getRange(2, 1, lastRow, lastCol).getValues();
    const matched = [];
    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      const className = formatLeaveSheetCell_(row[cClass]);
      const name = formatLeaveSheetCell_(row[cName]);
      if (!className && !name) continue;
      if (isLeavePrintedValue_(row[printedCol])) continue;

      matched.push({
        sheetRow: i + 2,
        className: className,
        studentId: formatLeaveSheetCell_(row[cId]),
        name: name,
        leaveType: formatLeaveSheetCell_(row[cType]),
        leaveDateText: formatLeaveDateRangeText_(row[cStart], row[cEnd]),
        reason: formatLeaveSheetCell_(row[cReason]),
        documentStatus: formatLeaveSheetCell_(row[cDoc]),
      });
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

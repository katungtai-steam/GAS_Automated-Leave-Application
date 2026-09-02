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
    ]);

    const row = sheet.getLastRow();
    return { ok: true, spreadsheetUrl: ss.getUrl(), row };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e || '未知錯誤') };
  }
}

function ensureLeaveSheetHeaders_(sheet, headers) {
  const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const isEmpty = firstRow.every((v) => String(v || '').trim() === '');
  if (isEmpty) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
}

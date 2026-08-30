/**
 * 工作記錄試算表寫入（WorkLogSheetService.js）
 */

function appendWorkLogToSheet_(data) {
  try {
    if (!SPREADSHEET_ID_ || SPREADSHEET_ID_ === 'YOUR_SPREADSHEET_ID') {
      return { ok: false, error: '尚未設定 SPREADSHEET_ID_。' };
    }

    const ss = openMainSpreadsheet_();
    let sheet = ss.getSheetByName(WORK_LOG_SHEET_NAME_);
    if (!sheet) {
      sheet = ss.insertSheet(WORK_LOG_SHEET_NAME_);
    }

    ensureLeaveSheetHeaders_(sheet, WORK_LOG_SHEET_HEADERS_);
    sheet.appendRow([
      data.recordedAt || new Date(),
      data.className || '',
      data.studentId || '',
      data.name || '',
      data.eventDescription || '',
      data.violationCategory || '',
      data.handlingLevel || '',
      data.recorder || '',
    ]);

    return { ok: true, spreadsheetUrl: ss.getUrl(), row: sheet.getLastRow() };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e || '未知錯誤') };
  }
}

/**
 * 工作記錄試算表寫入（WorkLogSheetService.js）
 */

function getWorkLogSheet_() {
  const ss = openWorkLogSpreadsheet_();
  if (WORK_LOG_SHEET_NAME_) {
    const sheet = ss.getSheetByName(WORK_LOG_SHEET_NAME_);
    if (!sheet) throw new Error('找不到工作記錄工作表（WORK_LOG_SHEET_NAME_）。');
    return sheet;
  }
  const sheets = ss.getSheets();
  if (!sheets.length) throw new Error('工作記錄試算表沒有任何工作表。');
  return sheets[0];
}

function appendWorkLogToSheet_(data) {
  try {
    if (!WORK_LOG_SPREADSHEET_ID_ || WORK_LOG_SPREADSHEET_ID_ === 'YOUR_WORK_LOG_SPREADSHEET_ID') {
      return { ok: false, error: '尚未設定 WORK_LOG_SPREADSHEET_ID_。' };
    }

    const ss = openWorkLogSpreadsheet_();
    const sheet = getWorkLogSheet_();
    const recordedAt = data.recordedAt instanceof Date ? data.recordedAt : new Date();
    const tz = Session.getScriptTimeZone() || 'Asia/Hong_Kong';
    const dateText = Utilities.formatDate(recordedAt, tz, 'yyyy/MM/dd');
    const timeText = Utilities.formatDate(recordedAt, tz, 'HH:mm:ss');

    ensureLeaveSheetHeaders_(sheet, WORK_LOG_SHEET_HEADERS_);
    sheet.appendRow([
      dateText,
      timeText,
      data.className || '',
      data.name || '',
      data.violationCategory || '',
      data.handlingLevel || '',
      data.eventDetail || '',
      data.needNotifyEmail || '否',
      data.followUpStatus || WORK_LOG_DEFAULT_FOLLOW_UP_STATUS_,
      data.rawDescription || '',
    ]);

    return { ok: true, spreadsheetUrl: ss.getUrl(), row: sheet.getLastRow() };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e || '未知錯誤') };
  }
}

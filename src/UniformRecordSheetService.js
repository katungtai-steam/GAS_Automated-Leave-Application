/**
 * 校服儀容記錄試算表寫入（UniformRecordSheetService.js）
 * 獨立於工作記錄；總表新增資料後會依班別同步至各班試算表。
 */

/** 供 Apps Script 編輯器手動執行（下拉選單請選此函式，勿選尾綴 _ 的版本） */
function syncUniformRecordsToClassSheets() {
  const result = syncUniformRecordsToClassSheets_();
  Logger.log(JSON.stringify(result));
  return result;
}

/** 供 Apps Script 編輯器手動執行：安裝總表 onEdit 自動分流觸發器 */
function installUniformRecordClassSyncTrigger() {
  const result = installUniformRecordClassSyncTrigger_();
  Logger.log(JSON.stringify(result));
  return result;
}

function isUniformRecordConfigured_() {
  return !!UNIFORM_RECORD_SPREADSHEET_ID_ && UNIFORM_RECORD_SPREADSHEET_ID_ !== 'YOUR_UNIFORM_RECORD_SPREADSHEET_ID';
}

function normalizeUniformRecordClassName_(className) {
  const s = String(className || '').trim();
  const m = s.match(/(\d+)\s*([A-Za-z])/);
  if (m) return `${m[1]}${m[2].toUpperCase()}`;
  return s;
}

function getUniformRecordClassSpreadsheetId_(className) {
  const key = normalizeUniformRecordClassName_(className);
  return key ? UNIFORM_RECORD_CLASS_SPREADSHEET_IDS_[key] || '' : '';
}

function getUniformRecordSheetFromSpreadsheet_(ss) {
  if (UNIFORM_RECORD_SHEET_NAME_) {
    const sheet = ss.getSheetByName(UNIFORM_RECORD_SHEET_NAME_);
    if (!sheet) throw new Error('找不到校服儀容工作表（UNIFORM_RECORD_SHEET_NAME_）。');
    return sheet;
  }
  const sheets = ss.getSheets();
  if (!sheets.length) throw new Error('校服儀容試算表沒有任何工作表。');
  return sheets[0];
}

function getUniformRecordMasterSheet_() {
  return getUniformRecordSheetFromSpreadsheet_(openUniformRecordSpreadsheet_());
}

function uniformRecordRowSignature_(rowValues) {
  const n = UNIFORM_RECORD_SHEET_HEADERS_.length;
  const parts = [];
  for (let i = 0; i < n; i++) {
    parts.push(String(rowValues[i] == null ? '' : rowValues[i]).trim());
  }
  return parts.join('\t');
}

function loadUniformRecordSignaturesFromSpreadsheet_(spreadsheetId) {
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sheet = getUniformRecordSheetFromSpreadsheet_(ss);
  const lastRow = sheet.getLastRow();
  const out = {};
  if (lastRow < 2) return out;
  const n = UNIFORM_RECORD_SHEET_HEADERS_.length;
  const values = sheet.getRange(2, 1, lastRow, n).getValues();
  for (let i = 0; i < values.length; i++) {
    const sig = uniformRecordRowSignature_(values[i]);
    if (sig.replace(/\t/g, '')) out[sig] = true;
  }
  return out;
}

function buildUniformRecordRowValues_(data) {
  const recordedAt = data.recordedAt instanceof Date ? data.recordedAt : new Date();
  const tz = Session.getScriptTimeZone() || 'Asia/Hong_Kong';
  const dateText =
    String(data.violationDate || '').trim() || Utilities.formatDate(recordedAt, tz, 'yyyy/MM/dd');
  const timeText =
    String(data.violationTime || '').trim() || Utilities.formatDate(recordedAt, tz, 'HH:mm:ss');
  return [
    dateText,
    timeText,
    data.className || '',
    data.studentId || '',
    data.name || '',
    data.violationType || '',
    data.improvementTime || '',
  ];
}

function appendUniformRecordRowToSpreadsheetId_(spreadsheetId, data, rowValues) {
  if (!spreadsheetId) {
    return { ok: false, error: '尚未設定試算表 ID。' };
  }
  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sheet = getUniformRecordSheetFromSpreadsheet_(ss);
  const values = rowValues || buildUniformRecordRowValues_(data);
  ensureLeaveSheetHeaders_(sheet, UNIFORM_RECORD_SHEET_HEADERS_);
  sheet.appendRow(values);
  return { ok: true, spreadsheetUrl: ss.getUrl(), row: sheet.getLastRow() };
}

/**
 * 將總表資料依班別同步至各班試算表（略過已存在的相同列）。
 * 可在 Apps Script 編輯器手動執行，或由 onEdit 觸發器自動執行。
 */
function syncUniformRecordsToClassSheets_() {
  try {
    if (!isUniformRecordConfigured_()) {
      return { ok: false, error: '尚未設定 UNIFORM_RECORD_SPREADSHEET_ID_。', synced: 0, skipped: 0, emailsSent: 0, emailErrors: [], errors: [] };
    }

    const masterSheet = getUniformRecordMasterSheet_();
    const lastRow = masterSheet.getLastRow();
    if (lastRow < 2) {
      return { ok: true, synced: 0, skipped: 0, emailsSent: 0, emailErrors: [], errors: [], message: '總表沒有資料列。' };
    }

    const colCount = UNIFORM_RECORD_SHEET_HEADERS_.length;
    const classIdx = UNIFORM_RECORD_SHEET_HEADERS_.indexOf('班別');
    const values = masterSheet.getRange(2, 1, lastRow, colCount).getValues();
    const classSigCache = {};
    let synced = 0;
    let skipped = 0;
    let emailsSent = 0;
    const errors = [];
    const emailErrors = [];

    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      const sig = uniformRecordRowSignature_(row);
      if (!sig.replace(/\t/g, '')) {
        skipped++;
        continue;
      }

      const className = classIdx >= 0 ? row[classIdx] : '';
      const classSpreadsheetId = getUniformRecordClassSpreadsheetId_(className);
      let didSomething = false;

      if (classSpreadsheetId) {
        if (!classSigCache[classSpreadsheetId]) {
          classSigCache[classSpreadsheetId] = loadUniformRecordSignaturesFromSpreadsheet_(classSpreadsheetId);
        }

        if (!classSigCache[classSpreadsheetId][sig]) {
          const writeResult = appendUniformRecordRowToSpreadsheetId_(classSpreadsheetId, null, row);
          if (!writeResult.ok) {
            errors.push({
              masterRow: i + 2,
              className: normalizeUniformRecordClassName_(className),
              error: writeResult.error,
            });
          } else {
            classSigCache[classSpreadsheetId][sig] = true;
            synced++;
            didSomething = true;
          }
        }
      }

      if (!isUniformRecordEmailAlreadySent_(sig)) {
        const notifyResult = notifyUniformRecordHomeroomTeachers_(className, row);
        if (notifyResult.ok && notifyResult.emails && notifyResult.emails.length) {
          markUniformRecordEmailSent_(sig);
          emailsSent += 1;
          didSomething = true;
        } else if (!notifyResult.ok && !notifyResult.skipped) {
          emailErrors.push({
            masterRow: i + 2,
            className: normalizeUniformRecordClassName_(className),
            error: notifyResult.error,
          });
        }
      }

      if (!didSomething) skipped++;
    }

    return {
      ok: errors.length === 0,
      synced,
      skipped,
      emailsSent,
      emailErrors,
      errors,
      message: `已同步 ${synced} 筆至班別試算表，略過 ${skipped} 筆，已發送 ${emailsSent} 封電郵（每班一封，同班班主任同收）。`,
    };
  } catch (e) {
    return {
      ok: false,
      error: String((e && e.message) || e || '未知錯誤'),
      synced: 0,
      skipped: 0,
      emailsSent: 0,
      emailErrors: [],
      errors: [],
    };
  }
}

/** 總表編輯時自動分流（需先執行 installUniformRecordClassSyncTrigger_ 安裝觸發器） */
function onUniformMasterSheetEdit_(e) {
  try {
    if (!e || !e.source) return;
    if (String(e.source.getId()) !== String(UNIFORM_RECORD_SPREADSHEET_ID_)) return;
    syncUniformRecordsToClassSheets_();
  } catch (err) {
    console.error('onUniformMasterSheetEdit_', err);
  }
}

/** 在 Apps Script 編輯器執行一次，安裝總表 onEdit 自動分流觸發器 */
function installUniformRecordClassSyncTrigger_() {
  const handler = 'onUniformMasterSheetEdit_';
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    const t = triggers[i];
    if (t.getHandlerFunction() === handler) {
      ScriptApp.deleteTrigger(t);
    }
  }
  ScriptApp.newTrigger(handler)
    .forSpreadsheet(UNIFORM_RECORD_SPREADSHEET_ID_)
    .onEdit()
    .create();
  return { ok: true, message: '已安裝校服儀容總表 onEdit 分流觸發器。' };
}

function appendUniformRecordToSheet_(data) {
  try {
    if (!isUniformRecordConfigured_()) {
      return { ok: false, error: '尚未設定 UNIFORM_RECORD_SPREADSHEET_ID_。' };
    }

    const masterResult = appendUniformRecordRowToSpreadsheetId_(UNIFORM_RECORD_SPREADSHEET_ID_, data);
    if (!masterResult.ok) return masterResult;

    const classSpreadsheetId = getUniformRecordClassSpreadsheetId_(data.className);
    let classResult = null;
    let classNotifyResult = null;
    if (classSpreadsheetId) {
      classResult = appendUniformRecordRowToSpreadsheetId_(classSpreadsheetId, data);
    }

    const rowValues = buildUniformRecordRowValues_(data);
    const sig = uniformRecordRowSignature_(rowValues);
    if (!isUniformRecordEmailAlreadySent_(sig)) {
      classNotifyResult = notifyUniformRecordHomeroomTeachers_(data.className, rowValues);
      if (classNotifyResult.ok && classNotifyResult.emails && classNotifyResult.emails.length) {
        markUniformRecordEmailSent_(sig);
      }
    }

    return {
      ok: true,
      spreadsheetUrl: masterResult.spreadsheetUrl,
      row: masterResult.row,
      classSpreadsheetUrl: classResult && classResult.ok ? classResult.spreadsheetUrl : '',
      classWriteError: classResult && !classResult.ok ? classResult.error : '',
      classSpreadsheetSkipped: !classSpreadsheetId,
      classNotifyEmail:
        classNotifyResult && classNotifyResult.ok && classNotifyResult.emails
          ? classNotifyResult.emails.join(', ')
          : '',
      classNotifyError: classNotifyResult && !classNotifyResult.ok ? classNotifyResult.error : '',
    };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e || '未知錯誤') };
  }
}

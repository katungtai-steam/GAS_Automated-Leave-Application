/**
 * 表單送出、驗證與附件處理（LeaveFormSubmit.js）
 */
function handleSubmitLeaveForm_(event) {
  const inputs = getFormInputsFromEvent_(event);
  const submittedAt = new Date();
  const studentKeyRaw = String(getFormValue_(inputs, 'studentKey') || '').trim();
  const parsedStudent = parseRosterStudentDropdownValue_(studentKeyRaw);
  const formClassName = String(getFormValue_(inputs, 'className') || '').trim();
  const data = {
    submittedAt,
    className: formClassName,
    studentKey: studentKeyRaw,
    studentId: '',
    name: '',
    leaveCategory: getFormValue_(inputs, 'leaveCategory') || 'day_slots',
    leaveDate: getFormValue_(inputs, 'leaveDate'),
    leaveDateEnd: getFormValue_(inputs, 'leaveDateEnd'),
    halfFullChoice: getFormValue_(inputs, 'halfFullChoice') || 'am',
    leaveStart: getFormValue_(inputs, 'leaveStart'),
    leaveEnd: getFormValue_(inputs, 'leaveEnd'),
    reasonChoice: getFormValue_(inputs, 'reasonChoice'),
    reasonOther: getFormValue_(inputs, 'reasonOther'),
    approver: getGmailUsernameFromEvent_(event),
  };

  // 名冊驗證/帶入：優先「班別 + 學號」避免跨班重複學號時誤用名冊第一筆（例如誤成 1A）
  try {
    if (isRosterConfigured_()) {
      const usedComposite = !!parsedStudent.className;
      const sid = usedComposite
        ? String(parsedStudent.studentId || '').trim()
        : String(parsedStudent.studentId || '').trim() || studentKeyRaw;
      const classForLookup = (parsedStudent.className || '').trim() || formClassName;
      if (sid) {
        let r = null;
        if (classForLookup) {
          r = lookupRosterStudentByClassAndId_(classForLookup, sid);
        }
        if ((!r || !r.ok || !r.student) && !usedComposite) {
          r = lookupRosterStudentById_(sid);
        }
        if (r && r.ok && r.student) {
          data.className = r.student.className;
          data.studentId = r.student.studentId;
          data.name = r.student.name;
        }
      }
    }
  } catch (e) {}

  // 若已選學生但名冊查不到：通常是名冊資料不一致，或下拉清單與名冊不同步
  if (isRosterConfigured_() && String(data.studentKey || '').trim() && (!data.studentId || !data.name)) {
    return {
      text:
        '找不到你選取的學生資料（名冊查無此學號）。\n' +
        '請確認名冊 `No.` 欄位是否正確，或重新選擇班別/學生後再送出。',
    };
  }

  const sheetLeave = buildSheetLeaveFields_(data);
  const leaveTimeForSheet = sheetLeave.leaveTimeForSheet;
  const exitTimeText = sheetLeave.exitTimeText;
  const leaveTypeLabel = sheetLeave.leaveTypeLabel;
  const leaveDateStart = sheetLeave.dateStart;
  const leaveDateEnd = sheetLeave.dateEnd;
  const leaveTimeStart = sheetLeave.timeStart;
  const leaveTimeEnd = sheetLeave.timeEnd;
  const reasonText =
    data.reasonChoice === '其他'
      ? String(data.reasonOther || '').trim()
      : String(data.reasonChoice || '').trim();

  const missing = [];
  if (!data.className) missing.push('班別');
  if (!isRosterConfigured_()) missing.push('試算表設定（ROSTER_SPREADSHEET_ID_）');
  if (!String(data.studentKey || '').trim()) missing.push('學生（從名冊選取）');
  if (!data.studentId) missing.push('學號（從名冊選取）');
  if (!data.name) missing.push('姓名（從名冊選取）');
  const leaveCat = normalizeLeaveCategoryValue_(data.leaveCategory);
  if (!data.leaveDate) missing.push(leaveCat === 'full_day_range' ? '事假開始日期' : '事假日期');
  if (leaveCat === 'day_slots') {
    if (!data.leaveStart) missing.push('時段開始');
    if (!data.leaveEnd) missing.push('時段完結');
  } else if (leaveCat === 'half_full_day') {
    const hk = String(data.halfFullChoice || '').trim();
    if (!hk || !HALF_FULL_DAY_CLOCK_[hk]) missing.push('半日／一日');
  } else if (leaveCat === 'full_day_range') {
    if (!String(data.leaveDateEnd || '').trim()) missing.push('事假結束日期');
    else {
      const t0 = parseSheetDateStringMs_(data.leaveDate);
      const t1 = parseSheetDateStringMs_(data.leaveDateEnd);
      if (!isNaN(t0) && !isNaN(t1) && t1 < t0) missing.push('結束日期不可早於開始日期');
    }
  }
  // 原因：只有選其他才可填原因（其他）
  if (data.reasonChoice !== '其他' && String(data.reasonOther || '').trim()) {
    missing.push('原因（其他）只可在原因選「其他」時填寫');
  }
  if (!reasonText) missing.push('原因');
  if (leaveCat === 'day_slots' && !exitTimeText) missing.push('離校時間（由時段開始推算）');
  if (leaveCat === 'half_full_day' && !exitTimeText) missing.push('離校時間');

  if (missing.length) {
    const keys = Object.keys(inputs || {});
    const extractedLines =
      keys.length === 0
        ? ''
        : '\n（偵錯）抽取到的值：\n' +
          [
            `- className="${data.className}"`,
            `- studentKey="${data.studentKey}"`,
            `- studentId="${data.studentId}"`,
            `- name="${data.name}"`,
            `- leaveCategory="${data.leaveCategory}"`,
            `- leaveDate="${data.leaveDate}"`,
            `- leaveDateEnd="${data.leaveDateEnd}"`,
            `- halfFullChoice="${data.halfFullChoice}"`,
            `- leaveStart="${data.leaveStart}"`,
            `- leaveEnd="${data.leaveEnd}"`,
            `- leaveTimeForSheet="${leaveTimeForSheet}"`,
            `- leaveTypeLabel="${leaveTypeLabel}"`,
            `- dateStart="${leaveDateStart}"`,
            `- dateEnd="${leaveDateEnd}"`,
            `- timeStart="${leaveTimeStart}"`,
            `- timeEnd="${leaveTimeEnd}"`,
            `- reasonChoice="${data.reasonChoice}"`,
            `- reasonOther="${data.reasonOther}"`,
            `- reasonText="${reasonText}"`,
            `- exitTime="${exitTimeText}"`,
          ].join('\n');
    const debug =
      keys.length === 0
        ? '（偵錯）本次事件沒有帶回任何 formInputs。通常代表 Chat App 的互動事件未正確傳遞表單值，或使用的事件 payload 路徑不同。'
        : `（偵錯）收到的 formInputs keys：${keys.join(', ')}`;
    return {
      text:
        `以下欄位尚未填寫：${missing.join('、')}\n\n` +
        '請再檢查表單後重新按「送出」。\n' +
        debug +
        extractedLines,
    };
  }

  const writeResult = appendLeaveToSheet_({
    submittedAt: data.submittedAt,
    className: data.className,
    studentId: data.studentId,
    name: data.name,
    leaveTypeLabel: leaveTypeLabel,
    leaveDateStart: leaveDateStart,
    leaveDateEnd: leaveDateEnd,
    leaveTimeStart: leaveTimeStart,
    leaveTimeEnd: leaveTimeEnd,
    exitTime: exitTimeText,
    reason: reasonText,
    // 文件情況：沒有上傳文件時一律先記錄「需補交」，若同學後續在聊天室上傳圖片，系統會自動改成「有相關文件」
    documentStatus: DOCUMENT_STATUS_NEED_SUBMIT_,
    approver: data.approver,
    leaveFormRef: '',
  });
  if (!writeResult.ok) {
    return {
      text:
        '寫入 Google Sheet 失敗：\n' +
        writeResult.error +
        trySpreadsheetBulletLine_() +
        '\n\n請確認 Sheet ID 與權限，或稍後再試。',
    };
  }

  let leaveFormUrl = '';
  let leaveFormDocNote = '';
  try {
    const repl = buildLeaveDocReplacements_(data, sheetLeave, data.submittedAt, reasonText);
    const fileHint =
      `請假單_${data.className || ''}_${data.name || ''}_${String(leaveDateStart || '').replace(/\//g, '-')}`;
    const docRes = generateLeaveDocFromSubmission_(repl, fileHint);
    if (docRes.skipped) {
      leaveFormDocNote = '';
    } else if (docRes.ok && docRes.url) {
      const up = updateLeaveFormUrlByRow_(writeResult.row, docRes.url);
      if (up.ok) {
        leaveFormUrl = docRes.url;
      } else {
        leaveFormDocNote = `\n請假單已產生，但寫入試算表連結失敗：${up.error}\n- 請假單：${docRes.url}\n- 試算表：${writeResult.spreadsheetUrl}`;
      }
    } else {
      leaveFormDocNote = `\n試算表已存，請假單產生失敗：${docRes.error}\n- 試算表：${writeResult.spreadsheetUrl}`;
    }
  } catch (e) {
    leaveFormDocNote = `\n試算表已存，請假單處理異常：${String((e && e.message) || e)}\n- 試算表：${writeResult.spreadsheetUrl}`;
  }

  // 記錄此使用者最新一筆申請的列號，供之後收到圖片附件時回寫「文件情況」
  try {
    const userKey = getChatBotUserKey_(event);
    if (writeResult.row) {
      PropertiesService.getScriptProperties().setProperty(`lastRow:${userKey}`, String(writeResult.row));
    }
  } catch (e) {}

  const tz = Session.getScriptTimeZone();
  const submittedAtText = Utilities.formatDate(data.submittedAt, tz, 'yyyy/MM/dd HH:mm:ss');
  const docLine = leaveFormUrl ? `- 請假單：${leaveFormUrl}\n` : '';
  return {
    text:
      '已送出並寫入試算表。\n' +
      `- 申請時間：${submittedAtText}\n` +
      `- 班別：${data.className}\n` +
      `- 學號：${data.studentId}\n` +
      `- 姓名：${data.name}\n` +
      `- 請假類型：${leaveTypeLabel}\n` +
      `- 事假日期(開始)：${leaveDateStart}\n` +
      `- 事假日期(結束)：${leaveDateEnd}\n` +
      `- 請假時間(開始)：${leaveTimeStart}\n` +
      `- 請假時間(結束)：${leaveTimeEnd}\n` +
      `- 離校時間：${exitTimeText}\n` +
      `- 原因：${reasonText}\n` +
      `- 文件情況：${DOCUMENT_STATUS_NEED_SUBMIT_}\n` +
      `- 批核者：${data.approver}\n` +
      docLine +
      leaveFormDocNote +
      `\n- 試算表：${writeResult.spreadsheetUrl}\n\n` +
      '要再填一筆，輸入「請假」。',
  };
}

function hasImageAttachment_(event) {
  try {
    const msg = (event && event.message) || {};
    const attachments = msg.attachments || msg.attachment || [];
    const list = Array.isArray(attachments) ? attachments : [attachments];
    if (!list.length) return false;
    for (let i = 0; i < list.length; i++) {
      const a = list[i] || {};
      const ct = String(a.contentType || a.mimeType || (a.attachmentDataRef && a.attachmentDataRef.contentType) || '').toLowerCase();
      if (ct.startsWith('image/')) return true;
      // 有些 payload 不帶 contentType，僅帶有 attachmentDataRef/driveDataRef；仍視作有文件
      if (a.attachmentDataRef || a.driveDataRef) return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

function handleDocumentAttachment_(event) {
  try {
    const userKey = getChatBotUserKey_(event);
    const lastRow = PropertiesService.getScriptProperties().getProperty(`lastRow:${userKey}`);
    if (!lastRow) {
      return { text: '收到文件，但找不到你最新一筆申請紀錄。請先送出申請表單後再上傳文件。' };
    }

    const updateResult = updateDocumentStatusByRow_(Number(lastRow), DOCUMENT_STATUS_HAS_FILE_);
    if (!updateResult.ok) {
      return { text: `收到文件，但更新試算表失敗：${updateResult.error}${trySpreadsheetBulletLine_()}` };
    }

    return {
      text:
        `已收到文件，並更新「文件情況」為「${DOCUMENT_STATUS_HAS_FILE_}」。\n` +
        `- 試算表：${updateResult.spreadsheetUrl}`,
    };
  } catch (e) {
    return { text: '收到文件，但處理時發生錯誤，請稍後再試。' };
  }
}

function updateDocumentStatusByRow_(row, statusText) {
  try {
    const r = Number(row);
    if (!r || r < 2) return { ok: false, error: '列號無效。' };

    const ss = openMainSpreadsheet_();
    const sheet = LEAVE_SHEET_NAME_ ? ss.getSheetByName(LEAVE_SHEET_NAME_) : ss.getSheets()[0];
    if (!sheet) return { ok: false, error: '找不到指定的工作表（LEAVE_SHEET_NAME_）。' };

    ensureLeaveSheetHeaders_(sheet, LEAVE_SHEET_HEADERS_);
    const headerRow = sheet.getRange(1, 1, 1, LEAVE_SHEET_HEADERS_.length).getValues()[0];
    let col = -1;
    for (let i = 0; i < headerRow.length; i++) {
      if (String(headerRow[i]).trim() === '文件情況') {
        col = i + 1;
        break;
      }
    }
    if (col === -1) return { ok: false, error: '找不到「文件情況」欄位。' };

    sheet.getRange(r, col).setValue(statusText);
    return { ok: true, spreadsheetUrl: ss.getUrl(), row: r };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e || '未知錯誤') };
  }
}

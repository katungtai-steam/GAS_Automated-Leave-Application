/**
 * 請假單 Google Doc 產生（LeaveDocService.js）
 */

/** yyyy/MM/dd →「5月2日」供告假句使用 */
function formatDateToMonthDayChinese_(yyyyMmDd) {
  const m = String(yyyyMmDd || '').trim().match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!m) return String(yyyyMmDd || '').trim();
  return `${Number(m[2])}月${Number(m[3])}日`;
}

function buildLeaveRangeSentenceForDoc_(cat, data, sheetLeave) {
  const ds = String(sheetLeave.dateStart || '').trim();
  const de = String(sheetLeave.dateEnd || '').trim() || ds;
  const sm = formatDateToMonthDayChinese_(ds);
  const em = formatDateToMonthDayChinese_(de);
  if (cat === 'half_full_day') {
    const hk = String((data && data.halfFullChoice) || 'am').trim();
    if (hk === 'am') return `${sm}（上午）至${em}（上午）告假。`;
    if (hk === 'pm') return `${sm}（下午）至${em}（下午）告假。`;
    return `${sm}（上午）至${em}（下午）告假。`;
  }
  if (cat === 'full_day_range') {
    return `${sm}（上午）至${em}（下午）告假。`;
  }
  return '';
}

function escapeForDocRegexForLeave_(literal) {
  return String(literal || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildLeaveDocReplacements_(data, sheetLeave, submittedAt, reasonText) {
  const tz = Session.getScriptTimeZone() || 'Asia/Taipei';
  const at = submittedAt instanceof Date ? submittedAt : new Date();
  const applyDate = Utilities.formatDate(at, tz, 'yyyy/MM/dd');
  const cat = normalizeLeaveCategoryValue_(data && data.leaveCategory);
  const reason = String(reasonText != null ? reasonText : '').trim();
  let rangeSentence = buildLeaveRangeSentenceForDoc_(cat, data, sheetLeave);
  if (!String(rangeSentence || '').trim()) rangeSentence = LEAVE_DOC_BLANK_RANGE_SENTENCE_;

  const timePair = [String(sheetLeave.timeStart || '').trim(), String(sheetLeave.timeEnd || '').trim()]
    .filter(Boolean)
    .join('-');
  const leaveDateSlot = cat === 'day_slots' ? String(sheetLeave.dateStart || '').trim() : '';
  const leaveTimeSlot = cat === 'day_slots' ? timePair : '';
  const exitTimeSlot = cat === 'day_slots' ? String(sheetLeave.exitTimeText || '').trim() : '';
  // 早退句：一天時段用真實月日與離校鐘點；其餘類型仍輸出空白版位句
  let slotSentence;
  if (cat === 'day_slots' && leaveDateSlot) {
    slotSentence = `${formatDateToMonthDayChinese_(leaveDateSlot)}  （時間︰    ${exitTimeSlot || '　　　　'} ）早退。`;
  } else {
    slotSentence = LEAVE_DOC_BLANK_SLOT_SENTENCE_;
  }

  return {
    '{{Name}}': String((data && data.name) || '').trim(),
    '{{Class}}': String((data && data.className) || '').trim(),
    '{{StudentId}}': String((data && data.studentId) || '').trim(),
    '{{Reason}}': reason,
    '{{ApplyDate}}': applyDate,
    '{{DocumentStatus}}': DOCUMENT_STATUS_NEED_SUBMIT_,
    '{{CheckRange}}': cat === 'half_full_day' || cat === 'full_day_range' ? '☑' : '☐',
    '{{CheckSlot}}': cat === 'day_slots' ? '☑' : '☐',
    '{{LeaveRangeSentence}}': rangeSentence,
    '{{LeaveSlotSentence}}': slotSentence,
    '{{LeaveDate}}': leaveDateSlot,
    '{{LeaveTime}}': leaveTimeSlot,
    '{{exitTime}}': exitTimeSlot,
  };
}

/** 取得副本目的地：自訂資料夾 → 範本所在資料夾 → null（改為 makeCopy 僅檔名） */
function getLeaveDocDestinationFolder_(templateFile, folderId) {
  const fid = String(folderId || '').trim();
  if (fid && fid !== 'YOUR_LEAVE_DOC_OUTPUT_FOLDER_ID') {
    try {
      return DriveApp.getFolderById(fid);
    } catch (e) {
      console.warn('getFolderById 失敗，改使用範本所在資料夾或根目錄:', fid, e);
    }
  }
  try {
    const ps = templateFile.getParents();
    if (ps.hasNext()) return ps.next();
  } catch (e2) {
    console.warn('讀取範本上層資料夾失敗:', e2);
  }
  return null;
}

function generateLeaveDocFromSubmission_(replacements, fileNameHint) {
  try {
    const tid = String(LEAVE_DOC_TEMPLATE_ID_ || '').trim();
    if (!tid || tid === 'YOUR_LEAVE_DOC_TEMPLATE_ID') {
      return { ok: false, skipped: true, error: '', url: '', id: '' };
    }

    const template = DriveApp.getFileById(tid);
    const base = String(fileNameHint || '請假單').replace(/[\\/:*?"<>|]/g, '_').trim() || '請假單';
    const name = base.slice(0, 180);
    const dest = getLeaveDocDestinationFolder_(template, LEAVE_DOC_OUTPUT_FOLDER_ID_);
    const newFile = dest ? template.makeCopy(name, dest) : template.makeCopy(name);
    const doc = DocumentApp.openById(newFile.getId());
    const body = doc.getBody();
    Object.keys(replacements).forEach((k) => {
      body.replaceText(escapeForDocRegexForLeave_(k), String(replacements[k] != null ? replacements[k] : ''));
    });
    doc.saveAndClose();
    return { ok: true, skipped: false, error: '', url: newFile.getUrl(), id: newFile.getId() };
  } catch (e) {
    return { ok: false, skipped: false, error: String((e && e.message) || e || '未知錯誤'), url: '', id: '' };
  }
}

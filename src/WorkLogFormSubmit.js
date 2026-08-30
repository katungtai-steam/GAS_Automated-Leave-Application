/**
 * 工作記錄送出（WorkLogFormSubmit.js）
 */

function handleSubmitWorkLogForm_(event) {
  const inputs = getFormInputsFromEvent_(event);
  const recordedAt = new Date();
  const studentKeyRaw = String(getFormValue_(inputs, 'wlStudentKey') || '').trim();
  const parsedStudent = parseRosterStudentDropdownValue_(studentKeyRaw);
  const formClassName = String(getFormValue_(inputs, 'wlClassName') || '').trim();
  const eventDescription = String(getFormValue_(inputs, 'wlEventDescription') || '').trim();

  const data = {
    recordedAt,
    className: formClassName,
    studentId: '',
    name: '',
    eventDescription,
    recorder: getGmailUsernameFromEvent_(event),
  };

  // 欄位 1：GAS 名冊查詢（不經 Gemini）
  try {
    if (isRosterConfigured_() && studentKeyRaw) {
      const usedComposite = !!parsedStudent.className;
      const sid = String(parsedStudent.studentId || '').trim() || studentKeyRaw;
      const classForLookup = (parsedStudent.className || '').trim() || formClassName;
      if (sid) {
        let r = classForLookup ? lookupRosterStudentByClassAndId_(classForLookup, sid) : null;
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

  const missing = [];
  if (!isRosterConfigured_()) missing.push('試算表設定（SPREADSHEET_ID_）');
  if (!studentKeyRaw) missing.push('學生（從名冊選取）');
  if (!data.studentId || !data.name) missing.push('姓名/學號（名冊查詢）');
  if (!eventDescription) missing.push('事件描述');

  if (missing.length) {
    return {
      text: `以下欄位尚未填寫或名冊查無資料：${missing.join('、')}\n\n請修正後再按「送出」。`,
    };
  }

  // 欄位 2：僅事件描述送 Gemini
  const gemini = parseWorkLogEventWithGemini_(eventDescription);
  if (!gemini.ok) {
    return {
      text:
        'Gemini 無法解析事件描述：\n' +
        gemini.error +
        '\n\n（姓名/班別已成功讀取名冊，未傳給 AI。請檢查 API Key 或稍後再試。）',
    };
  }

  const writeResult = appendWorkLogToSheet_({
    recordedAt: data.recordedAt,
    className: data.className,
    name: data.name,
    violationCategory: gemini.violationCategory,
    handlingLevel: gemini.handlingLevel,
    eventDetail: gemini.eventDetail,
    needNotifyEmail: gemini.needNotifyEmail,
    followUpStatus: WORK_LOG_DEFAULT_FOLLOW_UP_STATUS_,
    rawDescription: data.eventDescription,
  });

  if (!writeResult.ok) {
    return {
      text: '寫入工作記錄失敗：\n' + writeResult.error + trySpreadsheetBulletLine_(),
    };
  }

  const tz = Session.getScriptTimeZone();
  const timeText = Utilities.formatDate(data.recordedAt, tz, 'yyyy/MM/dd HH:mm:ss');
  return {
    text:
      '工作記錄已寫入試算表。\n' +
      `- 日期時間：${timeText}\n` +
      `- 班別：${data.className}\n` +
      `- 學生姓名：${data.name}\n` +
      `- 違規類別：${gemini.violationCategory}\n` +
      `- 處理等級：${gemini.handlingLevel}\n` +
      `- 事件詳情：${gemini.eventDetail}\n` +
      `- 是否需發信：${gemini.needNotifyEmail}\n` +
      `- 跟進狀態：${WORK_LOG_DEFAULT_FOLLOW_UP_STATUS_}\n` +
      `- 原始完整描述：${data.eventDescription}\n` +
      `- 試算表：${writeResult.spreadsheetUrl}\n\n` +
      '輸入任意文字可回到主選單。',
  };
}

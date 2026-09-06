/**
 * 黃紙級訓導跟進送出（YellowSlipFormSubmit.js）
 */

function handleSubmitYellowSlipGradeFollowUp_(event) {
  const inputs = getFormInputsFromEvent_(event);
  const sheetRowRaw = String(getFormValue_(inputs, 'ysRecordRow') || '').trim();
  const followUp = String(getFormValue_(inputs, 'ysGradeFollowUp') || '').trim();
  const remarkDraft = String(getFormValue_(inputs, 'ysGradeRemark') || '').trim();
  const teacher = getGmailUsernameFromEvent_(event);

  const missing = [];
  if (!isYellowSlipConfigured_()) missing.push('試算表設定（YELLOW_SLIP_SPREADSHEET_ID_）');
  if (!sheetRowRaw) missing.push('黃紙紀錄（請從下拉選取）');
  if (!followUp) missing.push('跟進紀錄（級訓導選項）');

  if (missing.length) {
    return {
      text: '以下欄位尚未填寫：' + missing.join('、') + '\n\n請修正後再按「送出級訓導跟進」。',
    };
  }

  const sheetRow = Number(sheetRowRaw);
  if (!sheetRow || sheetRow < 2) {
    return { text: '黃紙紀錄列號無效，請重新選擇。' };
  }

  const existing = getYellowSlipRecordByRow_(sheetRow);
  if (!existing.ok || !existing.record) {
    return { text: '讀取黃紙紀錄失敗：' + (existing.error || '未知錯誤') };
  }

  let remark = '';
  if (remarkDraft) {
    const polished = polishYellowSlipRemarkWithGemini_(remarkDraft, {
      followUpStatus: followUp,
      itemTaken: existing.record.itemTaken,
    });
    if (!polished.ok) {
      return {
        text:
          'Gemini 無法潤飾備註：\n' +
          polished.error +
          '\n\n（跟進尚未寫入。請檢查 API Key 或稍後再試；亦可先清空備註後送出。）',
      };
    }
    remark = polished.polishedRemark;
  }

  // 跟進欄寫入：選項 + 跟進人，方便試算表追溯
  const followUpWithTeacher = followUp + '（' + teacher + '）';
  const writeResult = updateYellowSlipGradeDiscipline_(sheetRow, followUpWithTeacher, remark);
  if (!writeResult.ok) {
    return { text: '寫入級訓導跟進失敗：\n' + writeResult.error };
  }

  const rec = writeResult.record || existing.record;
  let remarkLine = '- 級訓導備註：' + (remark || '（無）') + '\n';
  if (remarkDraft && remark && remark !== remarkDraft) {
    remarkLine =
      '- 級訓導備註（AI 潤飾）：' +
      remark +
      '\n' +
      '- 原始備註草稿：' +
      remarkDraft +
      '\n';
  }

  return {
    text:
      '級訓導跟進已寫入試算表。\n' +
      '- 列：' +
      sheetRow +
      '\n' +
      '- 學生：' +
      rec.className +
      ' #' +
      rec.classNo +
      ' ' +
      rec.name +
      '\n' +
      '- ItemTaken：' +
      (rec.itemTaken || '—') +
      '\n' +
      '- DateTime：' +
      (rec.dateTime || '—') +
      '\n' +
      '- 級訓導：' +
      followUpWithTeacher +
      '\n' +
      remarkLine +
      '- 試算表：' +
      writeResult.spreadsheetUrl +
      '\n\n' +
      '輸入「黃紙」或開啟主選單可繼續跟進。',
  };
}

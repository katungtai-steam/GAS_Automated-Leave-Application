/**
 * 黃紙跟進卡片（YellowSlipFormCard.js）
 * 檢索黃紙（A–F）與跟進（O–T）；級訓導以下拉寫入跟進與選填備註。
 */

function buildYellowSlipFormCard_(event) {
  const inputs = getFormInputsFromEvent_(event);
  const classResult = isYellowSlipConfigured_() ? getYellowSlipDistinctClasses_() : { ok: true, classes: [] };
  const classOptions =
    classResult && classResult.ok && classResult.classes && classResult.classes.length
      ? classResult.classes
      : CLASS_OPTIONS_;

  const rawClassName = getFormValue_(inputs, 'ysClassName');
  const selectedClassName = rawClassName || String(classOptions[0] || '').trim();
  const rawFilter = getFormValue_(inputs, 'ysFilterMode');
  const filterMode = rawFilter || YELLOW_SLIP_FILTER_PENDING_GRADE_;
  const selectedRow = getFormValue_(inputs, 'ysRecordRow');
  const selectedFollowUp = getFormValue_(inputs, 'ysGradeFollowUp');
  const remarkValue = getFormValue_(inputs, 'ysGradeRemark');

  const listResult = selectedClassName
    ? listYellowSlipRecords_({
        className: selectedClassName,
        filterMode: filterMode,
        maxList: YELLOW_SLIP_MAX_LIST_,
      })
    : { ok: true, records: [], truncated: false, totalMatched: 0 };

  const records = listResult && listResult.ok ? listResult.records || [] : [];
  let effectiveRow = selectedRow;
  if (effectiveRow) {
    let found = false;
    for (let i = 0; i < records.length; i++) {
      if (String(records[i].sheetRow) === String(effectiveRow)) {
        found = true;
        break;
      }
    }
    if (!found) effectiveRow = '';
  }

  const selectedRecord = effectiveRow
    ? records.filter(function (r) {
        return String(r.sheetRow) === String(effectiveRow);
      })[0]
    : null;

  const sections = [
    {
      header: '檢索條件',
      widgets: [
        {
          selectionInput: {
            name: 'ysClassName',
            label: '班別',
            type: 'DROPDOWN',
            onChangeAction: { action: { function: 'refreshYellowSlipForm' } },
            items: buildYellowSlipClassDropdownItems_(classOptions, rawClassName, classResult),
          },
        },
        {
          selectionInput: {
            name: 'ysFilterMode',
            label: '篩選',
            type: 'DROPDOWN',
            onChangeAction: { action: { function: 'refreshYellowSlipForm' } },
            items: [
              {
                text: '待級訓導跟進',
                value: YELLOW_SLIP_FILTER_PENDING_GRADE_,
                selected: filterMode === YELLOW_SLIP_FILTER_PENDING_GRADE_,
              },
              {
                text: '全部紀錄',
                value: YELLOW_SLIP_FILTER_ALL_,
                selected: filterMode === YELLOW_SLIP_FILTER_ALL_,
              },
            ],
          },
        },
      ],
    },
    {
      header: '黃紙紀錄（A–F）與跟進（O–T）',
      widgets: buildYellowSlipListWidgets_(listResult, records, selectedClassName),
    },
  ];

  sections.push({
    header: '級訓導跟進',
    widgets: [
      {
        selectionInput: {
          name: 'ysRecordRow',
          label: '選擇黃紙紀錄',
          type: 'DROPDOWN',
          onChangeAction: { action: { function: 'refreshYellowSlipForm' } },
          items: buildYellowSlipRecordDropdownItems_(listResult, records, effectiveRow),
        },
      },
      {
        selectionInput: {
          name: 'ysGradeFollowUp',
          label: '跟進紀錄（寫入「級訓導」欄）',
          type: 'DROPDOWN',
          items: buildYellowSlipFollowUpDropdownItems_(selectedFollowUp),
        },
      },
      {
        textInput: {
          name: 'ysGradeRemark',
          label: '備註（選填；送出後由 AI 潤飾再寫入「級訓導 備註」）',
          type: 'MULTIPLE_LINE',
          value: remarkValue || '',
        },
      },
      {
        textParagraph: {
          text: '有填備註時，送出後會經 Gemini 潤飾成正式行政用語再寫入試算表。',
        },
      },
    ],
  });

  if (selectedRecord) {
    sections.push({
      header: '已選紀錄摘要',
      widgets: [
        {
          textParagraph: {
            text: formatYellowSlipRecordDetailHtml_(selectedRecord),
          },
        },
      ],
    });
  }

  sections.push({
    widgets: [
      {
        buttonList: {
          buttons: [
            {
              text: '送出級訓導跟進',
              onClick: { action: { function: 'submitYellowSlipGradeFollowUp' } },
            },
            {
              text: '重新整理',
              onClick: { action: { function: 'refreshYellowSlipForm' } },
            },
            {
              text: '返回主選單',
              onClick: { action: { function: 'openMainMenu' } },
            },
          ],
        },
      },
    ],
  });

  return {
    cardsV2: [
      {
        cardId: 'yellowSlipForm',
        card: {
          header: {
            title: '黃紙跟進',
            subtitle: '檢索黃紙與跟進紀錄；級訓導以下拉填寫跟進（可選填備註）',
          },
          sections: sections,
        },
      },
    ],
  };
}

function buildYellowSlipClassDropdownItems_(classOptions, rawSelectedClassName, classResult) {
  if (isYellowSlipConfigured_() && classResult && !classResult.ok) {
    return [{ text: '班別讀取失敗：' + classResult.error, value: '', selected: true }];
  }
  if (!isYellowSlipConfigured_()) {
    return [{ text: '尚未設定黃紙試算表 ID', value: '', selected: true }];
  }
  const out = [];
  for (let i = 0; i < classOptions.length; i++) {
    const t = String(classOptions[i] || '').trim();
    if (!t) continue;
    out.push({
      text: t,
      value: t,
      selected: rawSelectedClassName ? rawSelectedClassName === t : i === 0,
    });
  }
  return out.length ? out : [{ text: '（試算表尚無班別）', value: '', selected: true }];
}

function buildYellowSlipFollowUpDropdownItems_(selectedFollowUp) {
  const current = String(selectedFollowUp || '').trim();
  const items = [{ text: '請選擇跟進選項', value: '', selected: !current }];
  for (let i = 0; i < YELLOW_SLIP_GRADE_DISCIPLINE_OPTIONS_.length; i++) {
    const t = YELLOW_SLIP_GRADE_DISCIPLINE_OPTIONS_[i];
    items.push({ text: t, value: t, selected: current === t });
  }
  return items;
}

function buildYellowSlipRecordDropdownItems_(listResult, records, effectiveRow) {
  if (listResult && !listResult.ok) {
    return [{ text: '讀取失敗：' + listResult.error, value: '', selected: true }];
  }
  if (!records || !records.length) {
    return [{ text: '目前沒有可跟進的紀錄', value: '', selected: true }];
  }
  const current = String(effectiveRow || '').trim();
  const items = [{ text: '請選擇一筆黃紙', value: '', selected: !current }];
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const value = String(r.sheetRow);
    const text =
      '#' +
      r.sheetRow +
      ' ' +
      r.className +
      ' ' +
      r.classNo +
      ' ' +
      r.name +
      '｜' +
      (r.itemTaken || '—') +
      '｜' +
      (r.dateTime || '');
    items.push({
      text: text.length > 80 ? text.slice(0, 77) + '…' : text,
      value: value,
      selected: current === value,
    });
  }
  return items;
}

function buildYellowSlipListWidgets_(listResult, records, selectedClassName) {
  if (!isYellowSlipConfigured_()) {
    return [{ textParagraph: { text: '尚未設定 YELLOW_SLIP_SPREADSHEET_ID_。' } }];
  }
  if (listResult && !listResult.ok) {
    return [{ textParagraph: { text: '讀取失敗：' + listResult.error } }];
  }
  if (!selectedClassName) {
    return [{ textParagraph: { text: '請先選擇班別。' } }];
  }
  if (!records.length) {
    return [{ textParagraph: { text: '此條件下沒有黃紙紀錄。' } }];
  }

  const widgets = [];
  const total = listResult.totalMatched != null ? listResult.totalMatched : records.length;
  let summary = '共 ' + total + ' 筆';
  if (listResult.truncated) {
    summary += '（卡片僅顯示前 ' + records.length + ' 筆，請改篩選條件）';
  }
  widgets.push({ textParagraph: { text: '<b>' + summary + '</b>' } });

  for (let i = 0; i < records.length; i++) {
    widgets.push({
      textParagraph: {
        text: formatYellowSlipRecordListHtml_(records[i], i + 1),
      },
    });
  }
  return widgets;
}

function formatYellowSlipRecordListHtml_(rec, index) {
  const pending = isYellowSlipPendingGrade_(rec) ? ' 〔待級訓導〕' : '';
  return (
    '<b>' +
    index +
    '. ' +
    escapeYellowSlipHtml_(rec.className) +
    ' #' +
    escapeYellowSlipHtml_(rec.classNo) +
    ' ' +
    escapeYellowSlipHtml_(rec.name) +
    pending +
    '</b><br>' +
    '物品：' +
    escapeYellowSlipHtml_(rec.itemTaken || '—') +
    '｜登記：' +
    escapeYellowSlipHtml_(rec.by || '—') +
    '｜時間：' +
    escapeYellowSlipHtml_(rec.dateTime || '—') +
    '<br>' +
    '班主任：' +
    escapeYellowSlipHtml_(rec.classTeacher || '—') +
    '（' +
    escapeYellowSlipHtml_(rec.classTeacherRemark || '無備註') +
    '）<br>' +
    '級訓導：' +
    escapeYellowSlipHtml_(rec.gradeDiscipline || '—') +
    '（' +
    escapeYellowSlipHtml_(rec.gradeDisciplineRemark || '無備註') +
    '）<br>' +
    '訓導主任：' +
    escapeYellowSlipHtml_(rec.disciplineMaster || '—') +
    '（' +
    escapeYellowSlipHtml_(rec.disciplineMasterRemark || '無備註') +
    '）'
  );
}

function formatYellowSlipRecordDetailHtml_(rec) {
  return (
    '<b>' +
    escapeYellowSlipHtml_(rec.className) +
    ' #' +
    escapeYellowSlipHtml_(rec.classNo) +
    ' ' +
    escapeYellowSlipHtml_(rec.name) +
    '</b>（列 ' +
    rec.sheetRow +
    '）<br>' +
    'ItemTaken：' +
    escapeYellowSlipHtml_(rec.itemTaken || '—') +
    '<br>By：' +
    escapeYellowSlipHtml_(rec.by || '—') +
    '<br>DateTime：' +
    escapeYellowSlipHtml_(rec.dateTime || '—') +
    '<br><br>' +
    '班主任：' +
    escapeYellowSlipHtml_(rec.classTeacher || '—') +
    '｜備註：' +
    escapeYellowSlipHtml_(rec.classTeacherRemark || '—') +
    '<br>級訓導：' +
    escapeYellowSlipHtml_(rec.gradeDiscipline || '—') +
    '｜備註：' +
    escapeYellowSlipHtml_(rec.gradeDisciplineRemark || '—') +
    '<br>訓導主任：' +
    escapeYellowSlipHtml_(rec.disciplineMaster || '—') +
    '｜備註：' +
    escapeYellowSlipHtml_(rec.disciplineMasterRemark || '—')
  );
}

function escapeYellowSlipHtml_(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function isYellowSlipFormInputs_(event) {
  try {
    const inputs = getFormInputsFromEvent_(event);
    return (
      inputs.ysClassName != null ||
      inputs.ysFilterMode != null ||
      inputs.ysRecordRow != null ||
      inputs.ysGradeFollowUp != null ||
      inputs.ysGradeRemark != null
    );
  } catch (e) {
    return false;
  }
}

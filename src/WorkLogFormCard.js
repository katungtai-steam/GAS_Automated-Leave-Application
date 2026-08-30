/**
 * 工作記錄卡片表單（WorkLogFormCard.js）
 * 欄位 1（班別/姓名）：GAS 名冊；欄位 2（事件描述）：使用者輸入，送出後才交 Gemini。
 */

function buildWorkLogFormCard_(event) {
  const inputs = getFormInputsFromEvent_(event);
  const rawSelectedClassName = getFormValue_(inputs, 'wlClassName');
  const rosterDistinctClasses = isRosterConfigured_() ? getRosterDistinctClasses_() : { ok: true, classes: [] };
  const classOptions =
    rosterDistinctClasses && rosterDistinctClasses.ok && rosterDistinctClasses.classes && rosterDistinctClasses.classes.length
      ? rosterDistinctClasses.classes
      : CLASS_OPTIONS_;
  const selectedClassName = rawSelectedClassName || String(classOptions[0] || '').trim();
  const selectedStudentKey = getFormValue_(inputs, 'wlStudentKey');

  const rosterClassResult = selectedClassName ? getRosterStudentsByClass_(selectedClassName) : { ok: true, students: [] };
  const rosterClassStudents = rosterClassResult && rosterClassResult.ok ? rosterClassResult.students : [];

  let effectiveStudentKey = selectedStudentKey;
  try {
    const maxN = Math.max(1, Number(ROSTER_MAX_STUDENTS_PER_CLASS_) || 1);
    const capped = rosterClassResult && rosterClassResult.ok && rosterClassStudents.length >= maxN;
    if (effectiveStudentKey && rosterClassResult && rosterClassResult.ok && rosterClassStudents.length && !capped) {
      let ok = false;
      for (let i = 0; i < rosterClassStudents.length; i++) {
        const s = rosterClassStudents[i];
        if (rosterStudentKeyMatchesRow_(effectiveStudentKey, selectedClassName, s.studentId)) {
          ok = true;
          break;
        }
      }
      if (!ok) effectiveStudentKey = '';
    }
  } catch (e) {}

  return {
    cardsV2: [
      {
        cardId: 'workLogForm',
        card: {
          header: {
            title: '工作記錄',
            subtitle: '班別/姓名由名冊讀取；事件描述送出後由 AI 判斷違規類別與處理等級',
          },
          sections: [
            {
              header: '學生（GAS 名冊）',
              widgets: [
                {
                  selectionInput: {
                    name: 'wlClassName',
                    label: '班別',
                    type: 'DROPDOWN',
                    onChangeAction: { action: { function: 'refreshWorkLogForm' } },
                    items: buildWorkLogClassDropdownItems_(classOptions, rawSelectedClassName, rosterDistinctClasses),
                  },
                },
                {
                  selectionInput: {
                    name: 'wlStudentKey',
                    label: '姓名（從名冊選取）',
                    type: 'DROPDOWN',
                    onChangeAction: { action: { function: 'refreshWorkLogForm' } },
                    items: buildWorkLogStudentDropdownItems_(
                      selectedClassName,
                      rosterClassResult,
                      rosterClassStudents,
                      effectiveStudentKey
                    ),
                  },
                },
              ],
            },
            {
              header: '事件（送出後 AI 解析）',
              widgets: [
                {
                  textInput: {
                    name: 'wlEventDescription',
                    label: '事件描述',
                    type: 'MULTIPLE_LINE',
                    value: getFormValue_(inputs, 'wlEventDescription'),
                  },
                },
                {
                  textParagraph: {
                    text:
                      '違規類別與處理等級將在按「送出」後，' +
                      '僅依「事件描述」由 Gemini 解析；姓名/班別不會傳給 AI。',
                  },
                },
              ],
            },
            {
              widgets: [
                {
                  buttonList: {
                    buttons: [
                      {
                        text: '送出',
                        onClick: { action: { function: 'submitWorkLogForm' } },
                      },
                      {
                        text: '返回主選單',
                        onClick: { action: { function: 'openMainMenu' } },
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      },
    ],
  };
}

function buildWorkLogClassDropdownItems_(classOptions, rawSelectedClassName, rosterDistinctClasses) {
  if (isRosterConfigured_() && rosterDistinctClasses && !rosterDistinctClasses.ok) {
    return [{ text: `班別清單讀取失敗：${rosterDistinctClasses.error}`, value: '', selected: true }];
  }
  const out = [];
  for (let i = 0; i < classOptions.length; i++) {
    const t = String(classOptions[i] || '').trim();
    if (!t) continue;
    out.push({ text: t, value: t, selected: rawSelectedClassName ? rawSelectedClassName === t : i === 0 });
  }
  return out.length ? out : [{ text: '（未設定班別選項）', value: '', selected: true }];
}

function buildWorkLogStudentDropdownItems_(selectedClassName, rosterClassResult, rosterClassStudents, effectiveStudentKey) {
  if (!selectedClassName) {
    return [{ text: '請先選擇班別', value: '', selected: true }];
  }
  if (rosterClassResult && !rosterClassResult.ok) {
    return [{ text: `名冊讀取失敗：${rosterClassResult.error}`, value: '', selected: true }];
  }
  if (!isRosterConfigured_()) {
    return [{ text: '尚未設定試算表 ID', value: '', selected: true }];
  }
  if (!rosterClassStudents.length) {
    return [{ text: '此班別在名冊找不到學生', value: '', selected: true }];
  }
  if (rosterClassStudents.length >= Math.max(1, Number(ROSTER_MAX_STUDENTS_PER_CLASS_) || 1)) {
    return [
      {
        text: `此班學生超過下拉上限（${ROSTER_MAX_STUDENTS_PER_CLASS_}）`,
        value: '',
        selected: true,
      },
    ];
  }
  const current = effectiveStudentKey;
  const items = [{ text: '請選擇學生', value: '', selected: !current }];
  for (let i = 0; i < rosterClassStudents.length; i++) {
    const s = rosterClassStudents[i];
    const value = rosterDropdownValueFor_(selectedClassName, s.studentId);
    const sid = String(s.studentId || '').trim();
    const text = `${sid} ${String(s.name || '').trim()}`.trim();
    items.push({
      text,
      value,
      selected: current === value || (!!current && current.indexOf('::') === -1 && current === sid),
    });
  }
  return items;
}

function isWorkLogFormInputs_(event) {
  try {
    const inputs = getFormInputsFromEvent_(event);
    return (
      inputs.wlClassName != null ||
      inputs.wlStudentKey != null ||
      inputs.wlEventDescription != null
    );
  } catch (e) {
    return false;
  }
}

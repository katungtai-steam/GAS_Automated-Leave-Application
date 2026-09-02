/**
 * 請假卡片表單 UI（LeaveFormCard.js）
 */

function buildLeaveFormCard_(event) {
  const inputs = getFormInputsFromEvent_(event);
  const rawSelectedClassName = getFormValue_(inputs, 'className');
  const rosterDistinctClasses = isRosterConfigured_() ? getRosterDistinctClasses_() : { ok: true, classes: [] };
  const classOptions =
    rosterDistinctClasses && rosterDistinctClasses.ok && rosterDistinctClasses.classes && rosterDistinctClasses.classes.length
      ? rosterDistinctClasses.classes
      : CLASS_OPTIONS_;
  // Google Chat dropdown 在「未互動」時 UI 可能會顯示第一項，但 formInputs 仍是空的；
  // 這裡以第一個班別作為預設，讓「學生下拉」能立即載入。
  const selectedClassName = rawSelectedClassName || String(classOptions[0] || '').trim();
  const selectedStudentKey = getFormValue_(inputs, 'studentKey'); // 新版為「班別::學號」，舊版可能僅學號

  const rosterClassResult = selectedClassName ? getRosterStudentsByClass_(selectedClassName) : { ok: true, students: [] };
  const rosterClassStudents = rosterClassResult && rosterClassResult.ok ? rosterClassResult.students : [];

  // 若換班別後，原本選的學生不在此班清單內，清空 studentKey（避免送出時帶錯人）
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

  const leaveCategory = normalizeLeaveCategoryValue_(getFormValue_(inputs, 'leaveCategory') || 'day_slots');
  const leaveDateMs = resolveFormDateMsDefaultToday_(inputs, 'leaveDate');
  const leaveDateEndMs = resolveFormDateMsDefaultToday_(inputs, 'leaveDateEnd');
  const currentHalfFull = getFormValue_(inputs, 'halfFullChoice') || 'am';

  const leaveCategoryRadio = {
    selectionInput: {
      name: 'leaveCategory',
      label: '請假類型',
      type: 'RADIO_BUTTON',
      onChangeAction: {
        action: {
          function: 'refreshLeaveForm',
        },
      },
      items: LEAVE_CATEGORY_OPTIONS_.map((o) => ({
        text: o.text,
        value: o.value,
        selected: o.value === leaveCategory,
      })),
    },
  };

  const leaveContentWidgets = [leaveCategoryRadio];
  if (leaveCategory === 'day_slots') {
    leaveContentWidgets.push(
      {
        dateTimePicker: {
          name: 'leaveDate',
          label: '事假日期',
          type: 'DATE_ONLY',
          valueMsEpoch: leaveDateMs,
        },
      },
      {
        selectionInput: {
          name: 'leaveStart',
          label: '時段開始',
          type: 'DROPDOWN',
          onChangeAction: {
            action: {
              function: 'refreshLeaveForm',
            },
          },
          items: SCHOOL_TIMESLOT_OPTIONS_.map((o) => ({
            text: o.text,
            value: o.value,
            selected: getFormValue_(inputs, 'leaveStart') === o.value,
          })),
        },
      },
      {
        selectionInput: {
          name: 'leaveEnd',
          label: '時段完結',
          type: 'DROPDOWN',
          onChangeAction: {
            action: {
              function: 'refreshLeaveForm',
            },
          },
          items: SCHOOL_TIMESLOT_OPTIONS_.map((o) => ({
            text: o.text,
            value: o.value,
            selected: getFormValue_(inputs, 'leaveEnd') === o.value,
          })),
        },
      }
    );
  } else if (leaveCategory === 'half_full_day') {
    leaveContentWidgets.push(
      {
        dateTimePicker: {
          name: 'leaveDate',
          label: '事假日期',
          type: 'DATE_ONLY',
          valueMsEpoch: leaveDateMs,
        },
      },
      {
        selectionInput: {
          name: 'halfFullChoice',
          label: '半日／一日',
          type: 'RADIO_BUTTON',
          onChangeAction: {
            action: {
              function: 'refreshLeaveForm',
            },
          },
          items: HALF_FULL_DAY_SUBOPTIONS_.map((o) => ({
            text: o.text,
            value: o.value,
            selected: o.value === currentHalfFull,
          })),
        },
      }
    );
  } else {
    leaveContentWidgets.push(
      {
        dateTimePicker: {
          name: 'leaveDate',
          label: '事假開始日期',
          type: 'DATE_ONLY',
          valueMsEpoch: leaveDateMs,
        },
      },
      {
        dateTimePicker: {
          name: 'leaveDateEnd',
          label: '事假結束日期',
          type: 'DATE_ONLY',
          valueMsEpoch: leaveDateEndMs,
        },
      }
    );
  }

  const cardPayload = {
    cardsV2: [
      {
        cardId: 'leaveForm',
        card: {
          header: {
            title: '學生事假申請',
            subtitle: '請填寫資料後按「送出」',
          },
          sections: [
            {
              header: '基本資料',
              widgets: [
                {
                  selectionInput: {
                    name: 'className',
                    label: '班別',
                    type: 'DROPDOWN',
                    onChangeAction: {
                      action: {
                        function: 'refreshLeaveForm',
                      },
                    },
                    items: (() => {
                      const current = rawSelectedClassName;
                      if (isRosterConfigured_() && rosterDistinctClasses && !rosterDistinctClasses.ok) {
                        return [
                          {
                            text: `班別清單讀取失敗：${rosterDistinctClasses.error}`,
                            value: '',
                            selected: true,
                          },
                        ];
                      }
                      const out = [];
                      for (let i = 0; i < classOptions.length; i++) {
                        const t = String(classOptions[i] || '').trim();
                        if (!t) continue;
                        const selected = current ? current === t : i === 0;
                        out.push({ text: t, value: t, selected });
                      }
                      return out.length ? out : [{ text: '（未設定班別選項）', value: '', selected: true }];
                    })(),
                  }
                },
                {
                  selectionInput: {
                    name: 'studentKey',
                    label: '學生（從名冊選取）',
                    type: 'DROPDOWN',
                    onChangeAction: {
                      action: {
                        function: 'refreshLeaveForm',
                      },
                    },
                    items: (() => {
                      if (!selectedClassName) {
                        return [{ text: '請先選擇班別', value: '', selected: true }];
                      }
                      if (rosterClassResult && !rosterClassResult.ok) {
                        return [{ text: `名冊讀取失敗：${rosterClassResult.error}`, value: '', selected: true }];
                      }
                      if (!isRosterConfigured_()) {
                        return [{ text: '尚未設定試算表 ID（ROSTER_SPREADSHEET_ID_）', value: '', selected: true }];
                      }
                      if (!rosterClassStudents.length) {
                        return [{ text: '此班別在名冊找不到學生（請檢查名冊 Class 欄位是否與班別一致）', value: '', selected: true }];
                      }
                      if (rosterClassStudents.length >= Math.max(1, Number(ROSTER_MAX_STUDENTS_PER_CLASS_) || 1)) {
                        return [
                          {
                            text: `此班學生超過下拉上限（${ROSTER_MAX_STUDENTS_PER_CLASS_}）。請調高 ROSTER_MAX_STUDENTS_PER_CLASS_ 或縮小範圍（例如分 sheet）。`,
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
                          selected:
                            current === value ||
                            (!!current && current.indexOf('::') === -1 && current === sid),
                        });
                      }
                      return items;
                    })(),
                  },
                },
              ],
            },
            {
              header: '事假內容',
              widgets: leaveContentWidgets.concat([
                {
                  selectionInput: {
                    name: 'reasonChoice',
                    label: '原因',
                    type: 'DROPDOWN',
                    items: REASON_OPTIONS_.map((v) => ({
                      text: v,
                      value: v,
                      selected: getFormValue_(inputs, 'reasonChoice') === v,
                    })),
                  },
                },
                {
                  textInput: {
                    name: 'reasonOther',
                    label: '原因（其他）',
                    value: getFormValue_(inputs, 'reasonOther'),
                  },
                },
                {
                  textParagraph: {
                    text:
                      '文件情況：如有文件，請在送出後直接於此聊天室上傳/拍照圖片；系統會自動於試算表記錄「有相關文件」。未上傳則預設記錄「需補交」。',
                  },
                },
              ]),
            },
            {
              widgets: [
                {
                  buttonList: {
                    buttons: [
                      {
                        text: '送出',
                        onClick: {
                          action: {
                            function: 'submitLeaveForm',
                          },
                        },
                      },
                      {
                        text: '重新填寫',
                        onClick: {
                          action: {
                            function: 'openLeaveForm',
                          },
                        },
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

  return cardPayload;
}

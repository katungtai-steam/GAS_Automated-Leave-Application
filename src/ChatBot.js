/**
 * Google Chat Bot 事件入口（ChatBot.js）
 */

function buildUpdateMessageResponse_(cardPayload) {
  return Object.assign({}, cardPayload || {}, {
    actionResponse: {
      type: 'UPDATE_MESSAGE',
    },
  });
}

function onMessage(event) {
  try {
    const ev = augmentEventForHandlers_(event);
    console.info('onMessage', usesNewChatEventFormat_(event) ? 'new-format' : 'legacy');

    if (hasImageAttachment_(ev)) {
      return wrapChatBotResponse_(event, handleDocumentAttachment_(ev));
    }

    const slashResult = handleSlashCommand_(ev);
    if (slashResult) return wrapChatBotResponse_(event, slashResult);

    const text = String((ev.message && ev.message.text) || '').trim();
    if (!text) return wrapChatBotResponse_(event, { text: '我目前只處理文字訊息。' });
    if (/^(工作記錄|worklog|違規)$/i.test(text)) return wrapChatBotResponse_(event, buildWorkLogFormCard_());
    if (/^(請假|leave|事假)$/i.test(text)) return wrapChatBotResponse_(event, buildLeaveFormCard_());
    return wrapChatBotResponse_(event, buildMainMenuCard_());
  } catch (err) {
    console.error('onMessage error', err);
    return wrapChatBotResponse_(event, {
      text: '處理時發生錯誤：' + String((err && err.message) || err || '未知錯誤'),
    });
  }
}

/**
 * 部分 Chat App 部署（含 slash command）會走 APP_COMMAND 而非 MESSAGE。
 */
function onAppCommand(event) {
  try {
    const meta = getAppCommandMetadata_(event);
    console.info('onAppCommand', JSON.stringify(meta));
    const result = handleAppCommandEvent_(event);
    if (result) return wrapChatBotResponse_(event, result);
    return wrapChatBotResponse_(event, {
      text: '未識別的 app command（id=' + String(meta.appCommandId) + '）。\n\n' + getSlashCommandHelpText_(),
    });
  } catch (err) {
    console.error('onAppCommand error', err);
    return wrapChatBotResponse_(event, {
      text: '處理指令時發生錯誤：' + String((err && err.message) || err || '未知錯誤'),
    });
  }
}

function onCardClick(event) {
  try {
    const ev = augmentEventForHandlers_(event);
    const invoked =
      (ev.common && ev.common.invokedFunction) ||
      (ev.action && (ev.action.actionMethodName || ev.action.actionMethod)) ||
      '';

    if (invoked === 'openMainMenu') return buildMainMenuCard_();
    if (invoked === 'openWorkLogForm') return buildWorkLogFormCard_();
    if (invoked === 'submitWorkLogForm') return handleSubmitWorkLogForm_(ev);
    if (invoked === 'refreshWorkLogForm') return buildUpdateMessageResponse_(buildWorkLogFormCard_(ev));

    if (invoked === 'submitLeaveForm') return handleSubmitLeaveForm_(ev);
    if (invoked === 'openLeaveForm') return buildLeaveFormCard_();
    if (invoked === 'refreshLeaveForm') return buildUpdateMessageResponse_(buildLeaveFormCard_(ev));

    if (isWorkLogFormInputs_(ev)) return buildUpdateMessageResponse_(buildWorkLogFormCard_(ev));
    if (hasMeaningfulFormInputs_(ev)) return buildUpdateMessageResponse_(buildLeaveFormCard_(ev));

    return wrapChatBotResponse_(event, buildMainMenuCard_());
  } catch (err) {
    console.error('onCardClick error', err);
    return wrapChatBotResponse_(event, { text: '處理表單時發生錯誤，請稍後再試。' });
  }
}

function onAddToSpace(event) {
  try {
    const ev = augmentEventForHandlers_(event);
    const spaceName = (ev.space && (ev.space.displayName || ev.space.name)) || '此對話';
    const who = (ev.user && ev.user.displayName) || '同學';
    return wrapChatBotResponse_(event, {
      text:
        `已加入：${spaceName}\n` +
        `你好 ${who}！我可以協助「事假申請」與「工作記錄」。\n\n` +
        getSlashCommandHelpText_(),
    });
  } catch (err) {
    return wrapChatBotResponse_(event, { text: '已加入此空間。' + getSlashCommandHelpText_() });
  }
}

function onRemoveFromSpace(event) {
  console.info('Bot removed from', (event && event.space && event.space.name) || 'this chat');
}

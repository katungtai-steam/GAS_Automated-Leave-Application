/**
 * Google Chat 事件正規化與回應格式（ChatEventUtils.js）
 * 兼容 legacy（event.message）與新版（event.chat.messagePayload）。
 */

function normalizeChatEvent_(event) {
  const chat = (event && event.chat) || null;
  const payload = (chat && chat.messagePayload) || null;
  return {
    message: (payload && payload.message) || (event && event.message) || null,
    space: (payload && payload.space) || (event && event.space) || null,
    user: (chat && chat.user) || (event && event.user) || null,
    appCommandPayload: (chat && chat.appCommandPayload) || (event && event.appCommandPayload) || null,
    appCommandMetadata:
      (chat && chat.appCommandPayload && chat.appCommandPayload.appCommandMetadata) ||
      (event && event.appCommandMetadata) ||
      null,
  };
}

/** 將正規化欄位合併回 event，供既有 handler 使用 */
function augmentEventForHandlers_(event) {
  const norm = normalizeChatEvent_(event);
  if (!norm.message && !norm.space && !norm.user) return event || {};
  return Object.assign({}, event || {}, {
    message: norm.message || event.message,
    space: norm.space || event.space,
    user: norm.user || event.user,
  });
}

function usesNewChatEventFormat_(event) {
  return !!(event && event.chat);
}

/**
 * 新版 Chat App（含部分 Admin / Add-on 部署）需 hostAppDataAction 包裝；
 * legacy 部署維持 { text / cardsV2 }。
 */
function wrapChatBotResponse_(event, payload) {
  if (!payload) {
    payload = { text: '（Bot 空回應，請查看 Executions 記錄）' };
  }
  if (payload.hostAppDataAction) return payload;

  // 卡片互動 UPDATE_MESSAGE 維持原格式
  if (payload.actionResponse) return payload;

  if (!usesNewChatEventFormat_(event)) return payload;

  const message = {};
  if (payload.text != null) message.text = payload.text;
  if (payload.cardsV2) message.cardsV2 = payload.cardsV2;
  if (payload.privateMessageViewer) message.privateMessageViewer = payload.privateMessageViewer;

  return {
    hostAppDataAction: {
      chatDataAction: {
        createMessageAction: { message: message },
      },
    },
  };
}

function getAppCommandMetadata_(event) {
  const norm = normalizeChatEvent_(event);
  const meta = norm.appCommandMetadata || {};
  const msg = (norm.appCommandPayload && norm.appCommandPayload.message) || norm.message || null;
  const sc = (msg && msg.slashCommand) || null;
  return {
    appCommandId: meta.appCommandId,
    appCommandType: meta.appCommandType || '',
    commandName: (sc && sc.commandName) || meta.commandName || '',
  };
}

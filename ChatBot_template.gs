// Learn more about Chat apps at https://developers.google.com/workspace/chat/overview

/**
 * Responds to a MESSAGE event in Google Chat.
 *
 * @param {Object} event the event object from Google Chat
 */
function onMessage(event) {
  if (!event || !event.space) {
    return {
      text:
        'Missing event payload. This function must be invoked by Google Chat (MESSAGE event), not by "Run" in Apps Script editor.',
    };
  }

  var name = "";

  if (event.space.type === "DM") {
    name = "You";
  } else {
    name = (event.user && event.user.displayName) ? event.user.displayName : "Someone";
  }
  var text = (event.message && typeof event.message.text === "string") ? event.message.text : "";
  var message = name + " said \"" + text + "\"";

  return { "text": message };
}

/**
 * Responds to an ADDED_TO_SPACE event in Google Chat.
 *
 * @param {Object} event the event object from Google Chat
 */
function onAddToSpace(event) {
  if (!event || !event.space) {
    return {
      text:
        'Missing event payload. This function must be invoked by Google Chat (ADDED_TO_SPACE event), not by "Run" in Apps Script editor.',
    };
  }

  var message = "";

  var displayName = (event.user && event.user.displayName) ? event.user.displayName : "there";

  // Prefer space.type when available; fall back to singleUserBotDm if present.
  var isDm = (event.space.type === "DM") || (!!event.space.singleUserBotDm);
  if (isDm) {
    message = "Thank you for adding me to a DM, " + displayName + "!";
  } else {
    message = "Thank you for adding me to " +
        (event.space.displayName ? event.space.displayName : "this chat");
  }

  if (event.message) {
    // Bot added through @mention.
    var addedText = (typeof event.message.text === "string") ? event.message.text : "";
    message = message + " and you said: \"" + addedText + "\"";
  }

  return { "text": message };
}

/**
 * Responds to a REMOVED_FROM_SPACE event in Google Chat.
 *
 * @param {Object} event the event object from Google Chat
 */
function onRemoveFromSpace(event) {
  var spaceName = (event && event.space && event.space.name) ? event.space.name : "this chat";
  console.info("Bot removed from ", spaceName);
}


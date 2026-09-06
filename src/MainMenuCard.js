/**
 * 主選單卡片（MainMenuCard.js）
 */

function buildMainMenuCard_() {
  return {
    cardsV2: [
      {
        cardId: 'mainMenu',
        card: {
          header: {
            title: '校務助手',
            subtitle: '請選擇要使用的功能',
          },
          sections: [
            {
              widgets: [
                {
                  buttonList: {
                    buttons: [
                      {
                        text: '事假申請',
                        onClick: { action: { function: 'openLeaveForm' } },
                      },
                      {
                        text: '工作記錄',
                        onClick: { action: { function: 'openWorkLogForm' } },
                      },
                      {
                        text: '黃紙跟進',
                        onClick: { action: { function: 'openYellowSlipForm' } },
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

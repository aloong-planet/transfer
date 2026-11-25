// The product copy that two or more prototype pages carry, in both languages: device names, the sample
// messages and file name, and the words for a message's state. A page reads window.PROTOTYPE_COPY and
// merges it into its own copy table, so a change to one of these strings is made here and nowhere else.
// A string only one page uses stays in that page's own table.
//
// A plain script that sets one global, not a module, so a page still opens by double-click over file://.
// The wording is the prototypes' own baseline: it is not generated from the app's dictionary and nothing
// asserts it equals it. Where a string is also a dictionary entry it holds the dictionary's present wording.
window.PROTOTYPE_COPY = {
  zh: {
    deviceLiving: '客厅 Mac',
    deviceOld: '旧笔记本',
    deviceWork: 'Work-PC',
    deviceWorkSub: 'Windows · 192.168.3.31',
    msgContract: '给你发了刚才那份合同',
    msgGotIt: '收到,我看下',
    fileContract: '合同-final.pdf',
    settings: '设置',
    received: '已接收',
    delivered: '已送达',
    composerPlaceholder: '输入消息,Enter 发送,Shift+Enter 换行'
  },
  en: {
    deviceLiving: 'Living Room Mac',
    deviceOld: 'Old Laptop',
    deviceWork: 'Work-PC',
    deviceWorkSub: 'Windows · 192.168.3.31',
    msgContract: 'Sent you that contract from earlier',
    msgGotIt: "Got it, I'll take a look",
    fileContract: 'contract-final.pdf',
    settings: 'Settings',
    received: 'Received',
    delivered: 'Delivered',
    composerPlaceholder: 'Type a message. Enter to send, Shift+Enter for newline'
  }
}

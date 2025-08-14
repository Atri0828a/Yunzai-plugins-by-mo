import plugin from '../../lib/plugins/plugin.js'

export class getMsgInfo extends plugin {
  constructor() {
    super({
      name: '取消息信息',
      dsc: '提取各种类型消息的全部字段信息（支持直接发或回复）',
      event: 'message',
      priority: 5000,
      rule: [
        {
          reg: '^#取$',
          fnc: 'getMsgInfo'
        }
      ]
    })
  }

  async getMsgInfo(e) {
    let msgList = []

    // 1. 如果是回复消息 → 优先取被回复的消息内容
    if (e.source) {
      try {
        let replyMsg
        if (e.isGroup) {
          replyMsg = await e.group.getChatHistory(e.source.seq, 1)
        } else {
          replyMsg = await e.friend.getChatHistory(e.source.time, 1)
        }

        if (replyMsg && replyMsg[0]?.message) {
          msgList = [...replyMsg[0].message]
        }
      } catch (err) {
        logger.error('获取被回复消息失败', err)
      }
    }

    // 2. 如果不是回复，或者回复消息没取到，就用当前消息本身
    if (msgList.length === 0) {
      msgList = [...e.message].filter(m => m.type !== 'text' || m.text.trim() !== '#取')
    }

    if (msgList.length === 0) {
      await e.reply('请发送 #取 + 消息，或回复一条消息再发送 #取')
      return true
    }

    // 3. 生成每个消息段的独立信息
    let forwardMsgs = msgList.map((seg, idx) => {
      let allFields = Object.entries(seg)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n')

      return {
        message: [`消息段 ${idx + 1} (type=${seg.type}):\n${allFields}`],
        nickname: e.bot?.nickname || '机器人',
        user_id: e.bot?.uin || 10000
      }
    })

    // 4. 合并转发
    if (e.isGroup) {
      let forward = await e.group.makeForwardMsg(forwardMsgs)
      await e.reply(forward)
    } else {
      let forward = await e.friend.makeForwardMsg(forwardMsgs)
      await e.reply(forward)
    }

    return true
  }
}

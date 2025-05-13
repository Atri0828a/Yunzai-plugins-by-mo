import fs from 'fs'
import yaml from 'yaml'

const yamlPath = 'config/config/other.yaml'

export class masterList extends plugin {
  constructor () {
    super({
      name: '主人列表',
      dsc: '列出机器人主人',
      event: 'message',
      priority: 50,
      rule: [{
        reg: '^#主人列表$',
        fnc: 'getMasterList'
      }]
    })
  }

  async getMasterList (e) {
    // 确保是群聊
    if (!e.isGroup) return false

    // 读取YAML文件
    let file = fs.readFileSync(yamlPath, 'utf8')
    let config = yaml.parse(file)
    let masters = config.masterQQ || []

    // 过滤掉"stdin"
    masters = masters.filter(id => id !== 'stdin')

    let result = `主人列表：\n`

    for (let id of masters) {
      let qq = parseInt(id)
      try {
        let member = await e.group.getMemberMap()
        if (member.has(qq)) {
          let name = member.get(qq).card || member.get(qq).nickname || '(无名)'
          result += `${qq}：${name}\n`
        } else {
          result += `${qq}：不在本群\n`
        }
      } catch (err) {
        result += `${qq}：查询失败\n`
      }
    }

    await e.reply(result)
    return true
  }
}

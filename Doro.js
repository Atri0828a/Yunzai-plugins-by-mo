//by陌
//图片解压后请放入resources/Doro

import { segment } from 'oicq';
const path = process.cwd();

function getRandomIntInRange(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export class tu extends plugin {
    constructor() {
        super({
            name: 'Doro结局',
            dsc: '抽取Doro结局',
            event: 'message',
            priority: 600,
            rule: [
                {
                    reg: '#今日Doro结局|#今日doro结局',
                    fnc: 'doro'
                }
            ]
        });
    }

    async doro(e) {
      let jpg1_number = getRandomIntInRange(1, 6);
      let png1_number = getRandomIntInRange(1, 18);
      let jpeg1_number = getRandomIntInRange(1, 7);
      let random_type = Math.floor(Math.random() * 3);
            if (random_type == 0)
               {e.reply(segment.image('file:///' + path + '/resources/Doro/' + jpg1_number + '.jpg'));
               } 
            else if (random_type == 1)
               {e.reply(segment.image('file:///' + path + '/resources/Doro/' + jpeg1_number + '.jpeg'));
               }
            else
               {e.reply(segment.image('file:///' + path + '/resources/Doro/' + png1_number + '.png'));        
               }
    }
}
import plugin from '../../lib/plugins/plugin.js';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

import axios from 'axios';
import got from 'got';
import puppeteer from 'puppeteer';

let isRunning = false;   // 全局锁
let timeoutTimer = null; // 超时定时器

export class jianhuang extends plugin {
  constructor() {
    super({
      name: '鉴黄',
      dsc: '鉴定',
      event: 'message',
      priority: 500,
      rule: [
        {
          reg: '^#?鉴黄$',
          fnc: 'checkNSFW'
        }
      ]
    });
  }



  // 并行下载
  async downloadImage(url, destPath) {
  logger.info(`开始并行下载图片: ${url}`);

  const controllers = {
    axios: new AbortController(),
    got: new AbortController(),
  };
  let puppeteerBrowser = null;

  // axios 方案
  const axiosTask = (async () => {
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      signal: controllers.axios.signal,
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Referer": "https://q.qpic.cn",
      },
      timeout: 30000,
    });
    return Buffer.from(res.data);
  })();

  // got 方案
  const gotTask = (async () => {
    const buffer = await got(url, {
      signal: controllers.got.signal,
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Referer": "https://q.qpic.cn",
      },
      timeout: { request: 30000 },
      retry: { limit: 1 },
    }).buffer();
    return buffer;
  })();

  // puppeteer 截图方案
  const puppeteerTask = (async () => {
    puppeteerBrowser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await puppeteerBrowser.newPage();
    await page.goto(url, { waitUntil: "networkidle2", timeout: 20000 });
    const buffer = await page.screenshot({ fullPage: true, type: "jpeg", quality: 90 });
    return buffer;
  })();

  try {
    const buffer = await Promise.any([axiosTask, gotTask, puppeteerTask]);

    // 成功后取消其他任务
    controllers.axios.abort();
    controllers.got.abort();
    if (puppeteerBrowser) {
      try { await puppeteerBrowser.close(); } catch {}
    }

    if (!buffer || buffer.length === 0) throw new Error("下载失败，未获取到有效 Buffer");

    await Bot.mkdir(path.dirname(destPath));
    await fs.promises.writeFile(destPath, buffer);

    const stat = fs.statSync(destPath);
    logger.info(`图片下载完成: ${(stat.size / 1024).toFixed(1)} KB -> ${destPath}`);
  } catch (err) {
    logger.error(`图片下载失败: ${err.message}`);
    // 确保清理 Puppeteer
    if (puppeteerBrowser) {
      try { await puppeteerBrowser.close(); } catch {}
    }
    throw err;
  }
}


  // 压缩图片
  async compressImage(inputPath, outputPath) {
    logger.info('开始压缩图片');
    let buffer = fs.readFileSync(inputPath);
    let quality = 90;
    let compressedBuffer = await sharp(buffer).jpeg({ quality }).toBuffer();

    while (compressedBuffer.length > 300 * 1024 && quality > 10) {
      logger.info(`压缩循环: 当前大小=${(compressedBuffer.length / 1024).toFixed(1)}KB, 降低质量=${quality}`);
      quality -= 10;
      compressedBuffer = await sharp(buffer).jpeg({ quality }).toBuffer();
    }

    logger.info(`压缩完成: 最终大小=${(compressedBuffer.length / 1024).toFixed(1)}KB, 最终质量=${quality}`);
    fs.writeFileSync(outputPath, compressedBuffer);
  }

  // 获取图片 URL
  async getImageUrls(e) {
    let imgUrls = [];

    if (e.source || e.reply_id) {
      let reply;
      if (e.getReply) {
        reply = await e.getReply();
      } else if (e.source) {
        if (e.group?.getChatHistory)
          reply = (await e.group.getChatHistory(e.source.seq, 1)).pop();
        else if (e.friend?.getChatHistory)
          reply = (await e.friend.getChatHistory(e.source.time, 1)).pop();
      }
      if (reply?.message) {
        for (let val of reply.message) {
          if (val.type === 'image' && val.url) {
            imgUrls.push(val.url);
          }
        }
      }
    } else if (e.img) {
      imgUrls.push(...e.img);
    }
    logger.info('图链:', imgUrls);
    return imgUrls;
  }

  async checkNSFW(e) {
    if (isRunning) {
      await e.reply('已有图片正在鉴定，请稍候再试...');
      return;
    }
    isRunning = true;

    // 设置超时（120秒）
    timeoutTimer = setTimeout(async () => {
      isRunning = false;
      await e.reply('鉴定超时失败，请稍后重试');
    }, 120 * 1000);

    let imgUrls = await this.getImageUrls(e);
    if (imgUrls.length === 0) {
      await e.reply('请附带图片或回复一张图片使用 #鉴黄');
      clearTimeout(timeoutTimer);
      isRunning = false;
      return;
    }

    await e.reply('正在下载并上传图片，请稍候...');

    // 准备资源目录
    const resDir = path.join(process.cwd(), 'resources', 'jianhuang');
    if (!fs.existsSync(resDir)) {
      fs.mkdirSync(resDir, { recursive: true });
    }

    // 执行任务前清理旧文件
    for (let file of ['tmp_nsfw.jpg', 'tmp_nsfw_compressed.jpg']) {
      const f = path.join(resDir, file);
      if (fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch (err) { console.warn('预清理失败:', err.message); }
      }
    }

    const tmpPath = path.join(resDir, 'tmp_nsfw.jpg');
    const compressedPath = path.join(resDir, 'tmp_nsfw_compressed.jpg');

    try {
      // 下载 & 压缩
      logger.info('开始下载原图');
      await this.downloadImage(imgUrls[0], tmpPath);
      logger.info('开始压缩图片');
      await this.compressImage(tmpPath, compressedPath);

      // Puppeteer 处理（上传到 magiconch）
      logger.info('启动 Puppeteer');
      const puppeteer = (await import('puppeteer')).default;
      const browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--single-process',
          '--disable-gpu'
        ],
        ignoreDefaultArgs: ['--enable-automation']
      });

      const page = await browser.newPage();
      logger.info('打开目标页面');
      await page.goto('https://magiconch.com/nsfw/', {
        waitUntil: 'networkidle2',
        timeout: 0
      });

      logger.info('选择文件并上传');
      const [fileChooser] = await Promise.all([
        page.waitForFileChooser({ timeout: 0 }),
        page.click('#up')
      ]);

      await fileChooser.accept([compressedPath]);

      await e.reply('已上传，正在等待结果渲染，请稍候...');
      logger.info('等待结果渲染 ');
      await new Promise(resolve => setTimeout(resolve, 35000));

      logger.info('截图页面');
      const screenshotBuffer = await page.screenshot({ fullPage: true });
      await e.reply(segment.image(screenshotBuffer));

      await browser.close();
      logger.info('Puppeteer 关闭完成');

    } catch (err) {
      logger.error(`任务失败: ${err.stack}`);
      await e.reply(`鉴定失败：${err.message}`);
    } finally {
      clearTimeout(timeoutTimer);
      isRunning = false;

      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
        if (fs.existsSync(compressedPath)) fs.unlinkSync(compressedPath);
      } catch (err) {
        console.warn('清理文件失败：', err.message);
      }
    }
  }

}


//by陌

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const MAX_SCREENSHOT_AGE_DAYS = 7; // 保留7天内的截图

// **获取当前文件的目录**
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// **使用相对路径**
const SCREENSHOT_DIR = path.resolve(__dirname, '../../resources/screenshot');

// **确保截图目录存在**
if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// 无需截图的域名（这部分是用AI列举的，有错加或者漏加的请自己根据需求改）
const NO_SCREENSHOT_DOMAINS = [
    /* ===== 短链跳转类 ===== */
    't.cn',
    'url.cn',
    'dwz.cn',
    'dwz.win',
    'bit.ly',
    'tinyurl.com',
    'goo.gl',
    'vk.cc',
    'qr.alipay.com',
    'u.jd.com',
    'jdshare.com',
    'tb.cn',
    'e.tb.cn',

    /* ===== 电商跳转统计类 ===== */
    's.click.taobao.com',
    'g.click.taobao.com',
    'mclick.simba.taobao.com',
    'click.mz.simba.taobao.com',
    'uland.taobao.com',
    'rec.m.jd.com',
    'stat.m.jd.com',

    /* ===== API 接口类 ===== */
    'api.bilibili.com',
    'api.github.com',
    'api.m.jd.com',
    'api.weibo.com',
    'api.douyin.com',
    'api.tiktok.com',
    'openapi.alipay.com',
    'openapi.weixin.qq.com',

    /* ===== CDN / 静态资源 ===== */
    'alicdn.com',
    'alibabausercontent.com',
    'biliimg.com',
    'hdslb.com',
    'gstatic.com',
    'cloudflare.com',
    'cdnjs.cloudflare.com',
    'jsdelivr.net',
    'qlogo.cn',
    'qnimg.com',
    'meituan.net',
    'csdnimg.cn',
    'githubusercontent.com',
    'steamstatic.com',

    /* ===== 视频站点（高几率反爬） ===== */
    'v.qq.com',
    'youku.com',
    'iqiyi.com',
    'mgtv.com',
    'douyin.com',
    'tiktok.com',
    'bilibili.com', // 播放页

    /* ===== 内网 & 穿透服务 ===== */
    'frp-fun.com',
    'frp-gap.com',
    'natfrp.com',
    'natapp.cn',
    'natappfree.com',
    'freefrp.net',
    'frp.run',
    'ngrok.io',
    'localhost',
    '127.0.0.1',
    '.lan',
    '.internal',

    /* ===== 广告跳转 & 追踪 ===== */
    'doubleclick.net',
    'googlesyndication.com',
    'adservice.google.com',
    'scorecardresearch.com',
    'cr-nielsen.com',

    /* ===== 安全拦截页 ===== */
    'safe.sankuai.com',
    'antivirus.baidu.com',
    'urlsec.qq.com',
    'guanjia.qq.com',

    /* ===== 移动 APP 跳转 ===== */
    'l.instagram.com',
    'l.facebook.com',
    'l.tiktok.com',
    'lnk0.com',
    'at.umeng.com',
    'app.adjust.com',
    'appsflyer.com'
];


// 判断是否属于无需截图域名
function isNoScreenshot(url) {
    try {
        const hostname = new URL(url).hostname;
        return NO_SCREENSHOT_DOMAINS.some(d => hostname.includes(d));
    } catch (err) {
        return false;
    }
}


// **网页截图函数**
async function captureScreenshot(url, filename) {
    // 先清理旧截图
    await cleanupOldScreenshots();
    
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();

    try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        await page.screenshot({ path: filename, fullPage: true });
        logger.info('截图完成:', filename);
    } catch (error) {
        logger.error('截图失败:', error);
    } finally {
        await browser.close();
    }
}

// 清理旧截图函数
async function cleanupOldScreenshots() {
    try {
        const files = fs.readdirSync(SCREENSHOT_DIR);
        const now = Date.now();
        const cutoff = now - (MAX_SCREENSHOT_AGE_DAYS * 24 * 60 * 60 * 1000);
        
        files.forEach(file => {
            if (file.startsWith('screenshot_') && file.endsWith('.png')) {
                const filePath = path.join(SCREENSHOT_DIR, file);
                const stats = fs.statSync(filePath);
                if (stats.mtimeMs < cutoff) {
                    fs.unlinkSync(filePath);
                    logger.info('删除旧截图:', file);
                }
            }
        });
    } catch (error) {
        logger.error('清理旧截图时出错:', error);
    }
}

// **自动模式 URL 正则（不匹配纯 IP、localhost、中文域名）**
const autoUrlRegex = /(?!#网页截图)(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}([/?#][^\s]*)?/;
// **手动模式 URL 正则（匹配任何输入）**
const manualUrlRegex = /^#网页截图\s*(.+)$/;

// **插件类**
export class AutoWebScreenshot extends plugin {
    constructor() {
        super({
            name: '自动网页截图',
            dsc: '检测消息中的链接并自动截图',
            event: 'message',
            priority: 30000000,
            rule: [
                { reg: manualUrlRegex, fnc: 'manualCaptureWebScreenshot' }, // 手动模式
                { reg: autoUrlRegex, fnc: 'autoCaptureWebScreenshot' }  // 自动模式
            ]
        });
    }
 
    // **自动模式触发逻辑**
async autoCaptureWebScreenshot(e) {
    
    if (e.msg.startsWith("#")) return;
    if (e.msg.startsWith("{") && e.msg.includes('":')) return;
    if (e.msg.startsWith("```")) return;
    if (e.msg.length > 500) return;
    if (e.msg.includes('[CQ:')) return; // 避免识别富媒体消息
    
    const match = e.msg.match(autoUrlRegex);
    if (!match) return;

    let url = match[0];

    // **如果网址没有 http，就加上默认的 http://**
    if (!/^https?:\/\//.test(url)) {
        url = 'http://' + url;
    }

    // 白名单过滤
    if (isNoScreenshot(url)) {
        logger.info(`跳过无需截图域名：${url}`);
        return;
    }

    let filename = path.join(SCREENSHOT_DIR, `screenshot_${Date.now()}.png`);

    logger.info(`检测到网址：${url}，正在截图...`);
    await captureScreenshot(url, filename);

    if (fs.existsSync(filename)) {
        await e.reply(segment.image(filename));
    } else {
        logger.error('截图失败，请检查网址是否有效。');
    }
}

    async manualCaptureWebScreenshot(e) {
        const match = e.msg.match(manualUrlRegex);
        if (!match) return;

        let url = match[1].trim();
        
        if (!/^https?:\/\//.test(url)) {
            url = 'http://' + url;
        }
        
        let filename = path.join(SCREENSHOT_DIR, `screenshot_${Date.now()}.png`);

        await e.reply(`手动截图模式，正在访问：${url}...`);
        await captureScreenshot(url, filename);

        if (fs.existsSync(filename)) {
            await e.reply(segment.image(filename));
        } else {
            await e.reply('截图失败，请检查网址是否有效。');
        }
    }
}

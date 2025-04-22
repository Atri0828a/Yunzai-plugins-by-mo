//by陌

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// **获取当前文件的目录**
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// **使用相对路径**
const SCREENSHOT_DIR = path.resolve(__dirname, '../../resources/screenshot');

// **确保截图目录存在**
if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// **网页截图函数**
async function captureScreenshot(url, filename) {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();

    try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        await page.screenshot({ path: filename, fullPage: true });
        console.log('截图完成:', filename);
    } catch (error) {
        console.error('截图失败:', error);
    } finally {
        await browser.close();
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
            priority: 100000,
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
    
    const match = e.msg.match(autoUrlRegex);
    if (!match) return;

    let url = match[0];

    // **如果网址没有 http，就加上默认的 http://**
    if (!/^https?:\/\//.test(url)) {
        url = 'http://' + url;
    }

    let filename = path.join(SCREENSHOT_DIR, `screenshot_${Date.now()}.png`);

    await e.reply(`检测到网址：${url}，正在截图...`);
    await captureScreenshot(url, filename);

    if (fs.existsSync(filename)) {
        await e.reply(segment.image(filename));
    } else {
        await e.reply('截图失败，请检查网址是否有效。');
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
import puppeteer from 'puppeteer';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import config from './config.js';
import Logger from './logger.js';

class HTMLDebugger {
    constructor() {
        this.logger = new Logger('./logs');
        this.browser = null;
        this.page = null;
    }

    async init() {
        this.logger.start('Khởi tạo HTML Debugger...');
        
        this.browser = await puppeteer.launch({
            headless: config.browser.headless,
            args: config.browser.args
        });

        this.page = await this.browser.newPage();
        
        // Thiết lập proxy authentication nếu có
        if (config.proxy.enabled) {
            await this.page.authenticate({
                username: config.proxy.username,
                password: config.proxy.password
            });
        }
        
        await this.page.setViewport({ width: 1920, height: 1080 });
        await this.page.setUserAgent(config.browser.userAgent);
        await this.page.setExtraHTTPHeaders(config.headers);

        this.logger.success('Browser đã được khởi tạo');
    }

    async debugHTML() {
        try {
            this.logger.info('🔍 Đang truy cập trang và debug HTML...');
            
            await this.page.goto(config.baseUrl, { 
                waitUntil: 'networkidle2',
                timeout: config.crawl.timeout 
            });

            this.logger.success('Đã tải trang thành công');

            // Tạo thư mục debug trước
            try {
                await fs.mkdir('./debug', { recursive: true });
            } catch (error) {
                // Thư mục đã tồn tại
            }

            // Lấy HTML của toàn bộ trang
            const fullHTML = await this.page.content();
            await fs.writeFile('./debug/full-page.html', fullHTML, 'utf8');
            this.logger.info('💾 Đã lưu full HTML vào debug/full-page.html');

            // Debug các NFT items
            const debugInfo = await this.page.evaluate((selectors) => {
                const debug = {
                    foundSelectors: [],
                    nftItems: [],
                    sampleHTML: []
                };

                // Test từng selector
                for (const selector of selectors.nftItems) {
                    const elements = document.querySelectorAll(selector);
                    if (elements.length > 0) {
                        debug.foundSelectors.push({
                            selector: selector,
                            count: elements.length
                        });
                    }
                }

                // Lấy mẫu HTML của 3 items đầu tiên
                const allItems = document.querySelectorAll('._1mg8eoah, [class*="card"], [class*="item"]');
                for (let i = 0; i < Math.min(3, allItems.length); i++) {
                    const item = allItems[i];
                    debug.sampleHTML.push({
                        index: i,
                        outerHTML: item.outerHTML,
                        className: item.className,
                        images: Array.from(item.querySelectorAll('img')).map(img => ({
                            src: img.src,
                            alt: img.alt,
                            className: img.className
                        })),
                        textContent: item.textContent.trim().substring(0, 200)
                    });
                }

                return debug;
            }, config.selectors);

            // Tạo thư mục debug
            try {
                await fs.mkdir('./debug', { recursive: true });
            } catch (error) {
                // Thư mục đã tồn tại
            }

            // Lưu debug info
            await fs.writeFile('./debug/debug-info.json', JSON.stringify(debugInfo, null, 2), 'utf8');
            this.logger.success('💾 Đã lưu debug info vào debug/debug-info.json');

            // In ra console
            this.logger.info('🔍 Kết quả debug:');
            this.logger.info(`   • Tìm thấy selectors: ${debugInfo.foundSelectors.length}`);
            debugInfo.foundSelectors.forEach(s => {
                this.logger.info(`     - ${s.selector}: ${s.count} elements`);
            });
            
            this.logger.info(`   • Sample HTML: ${debugInfo.sampleHTML.length} items`);
            debugInfo.sampleHTML.forEach(item => {
                this.logger.info(`     - Item ${item.index}: ${item.images.length} images`);
                item.images.forEach(img => {
                    this.logger.info(`       * ${img.alt || 'No alt'}: ${img.src}`);
                });
            });

            return debugInfo;
            
        } catch (error) {
            this.logger.error('❌ Lỗi debug HTML:', error.message);
            throw error;
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.logger.info('🔒 Browser đã được đóng');
        }
    }

    async run() {
        try {
            await this.init();
            const debugInfo = await this.debugHTML();
            
            this.logger.complete('🎉 Debug hoàn thành!');
            return debugInfo;
            
        } catch (error) {
            this.logger.error('💥 Lỗi trong quá trình debug:', error);
            throw error;
        } finally {
            await this.close();
        }
    }
}

// Chạy debug
async function main() {
    const htmlDebugger = new HTMLDebugger();
    
    try {
        await htmlDebugger.run();
    } catch (error) {
        console.error('Lỗi chính:', error);
        process.exit(1);
    }
}

// Chạy nếu file được gọi trực tiếp
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main();
}

export default HTMLDebugger;

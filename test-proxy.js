import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import config from './config.js';
import Logger from './logger.js';

class ProxyTester {
    constructor() {
        this.logger = new Logger('./logs');
        this.browser = null;
        this.page = null;
    }

    async init() {
        this.logger.start('Khởi tạo Proxy Tester...');
        
        // Khởi tạo browser với proxy
        this.browser = await puppeteer.launch({
            headless: false,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--proxy-server=http://103.120.146.11:8080'
            ]
        });

        this.page = await this.browser.newPage();
        
        // Thiết lập proxy authentication
        if (config.proxy.enabled) {
            await this.page.authenticate({
                username: config.proxy.username,
                password: config.proxy.password
            });
            this.logger.info(`Đã thiết lập proxy: ${config.proxy.host}:${config.proxy.port}`);
        }
        
        // Thiết lập viewport
        await this.page.setViewport({ width: 1920, height: 1080 });
        await this.page.setUserAgent(config.browser.userAgent);
        
        this.logger.success('Browser đã được khởi tạo với proxy');
    }

    async testProxyConnection() {
        try {
            this.logger.info('🔍 Kiểm tra kết nối proxy...');
            
            // Test 1: Kiểm tra IP hiện tại
            const startTime = Date.now();
            await this.page.goto('https://httpbin.org/ip', { 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });
            
            const ipData = await this.page.evaluate(() => {
                return document.body.textContent;
            });
            
            const endTime = Date.now();
            const responseTime = endTime - startTime;
            
            this.logger.success(`✅ Kết nối proxy thành công!`);
            this.logger.info(`📊 IP hiện tại: ${ipData}`);
            this.logger.info(`⏱️ Thời gian phản hồi: ${responseTime}ms`);
            
            return {
                success: true,
                ip: ipData,
                responseTime: responseTime
            };
            
        } catch (error) {
            this.logger.error('❌ Lỗi kết nối proxy:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async testTargetWebsite() {
        try {
            this.logger.info('🎯 Kiểm tra truy cập website mục tiêu...');
            
            const startTime = Date.now();
            await this.page.goto(config.baseUrl, { 
                waitUntil: 'networkidle2',
                timeout: 30000 
            });
            
            const endTime = Date.now();
            const responseTime = endTime - startTime;
            
            // Lấy thông tin trang
            const pageInfo = await this.page.evaluate(() => {
                return {
                    title: document.title,
                    url: window.location.href,
                    hasContent: document.body.textContent.length > 0
                };
            });
            
            this.logger.success(`✅ Truy cập website thành công!`);
            this.logger.info(`📄 Tiêu đề: ${pageInfo.title}`);
            this.logger.info(`🔗 URL: ${pageInfo.url}`);
            this.logger.info(`⏱️ Thời gian tải: ${responseTime}ms`);
            this.logger.info(`📝 Có nội dung: ${pageInfo.hasContent ? 'Có' : 'Không'}`);
            
            return {
                success: true,
                pageInfo: pageInfo,
                responseTime: responseTime
            };
            
        } catch (error) {
            this.logger.error('❌ Lỗi truy cập website:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async testMultipleSites() {
        const testSites = [
            'https://httpbin.org/ip',
            'https://httpbin.org/headers',
            'https://httpbin.org/user-agent',
            'https://www.google.com',
            'https://www.github.com'
        ];
        
        this.logger.info('🌐 Kiểm tra nhiều website...');
        const results = [];
        
        for (const site of testSites) {
            try {
                const startTime = Date.now();
                await this.page.goto(site, { 
                    waitUntil: 'networkidle2',
                    timeout: 15000 
                });
                const endTime = Date.now();
                
                const result = {
                    site: site,
                    success: true,
                    responseTime: endTime - startTime,
                    status: 'OK'
                };
                
                results.push(result);
                this.logger.info(`✅ ${site} - ${result.responseTime}ms`);
                
            } catch (error) {
                const result = {
                    site: site,
                    success: false,
                    error: error.message,
                    status: 'FAILED'
                };
                
                results.push(result);
                this.logger.warning(`❌ ${site} - ${error.message}`);
            }
            
            // Delay giữa các request
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        return results;
    }

    async runSpeedTest() {
        this.logger.info('⚡ Kiểm tra tốc độ proxy...');
        
        const testUrl = 'https://httpbin.org/bytes/1024'; // 1KB data
        const iterations = 5;
        const times = [];
        
        for (let i = 0; i < iterations; i++) {
            try {
                const startTime = Date.now();
                await this.page.goto(testUrl, { 
                    waitUntil: 'networkidle2',
                    timeout: 10000 
                });
                const endTime = Date.now();
                
                times.push(endTime - startTime);
                this.logger.info(`📊 Lần ${i + 1}: ${endTime - startTime}ms`);
                
            } catch (error) {
                this.logger.error(`❌ Lần ${i + 1} thất bại:`, error.message);
            }
            
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        if (times.length > 0) {
            const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
            const minTime = Math.min(...times);
            const maxTime = Math.max(...times);
            
            this.logger.success(`📈 Kết quả tốc độ:`);
            this.logger.info(`   • Trung bình: ${avgTime.toFixed(2)}ms`);
            this.logger.info(`   • Nhanh nhất: ${minTime}ms`);
            this.logger.info(`   • Chậm nhất: ${maxTime}ms`);
            
            return {
                average: avgTime,
                min: minTime,
                max: maxTime,
                times: times
            };
        }
        
        return null;
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
            
            // Test 1: Kiểm tra kết nối proxy
            const proxyTest = await this.testProxyConnection();
            
            // Test 2: Kiểm tra website mục tiêu
            const targetTest = await this.testTargetWebsite();
            
            // Test 3: Kiểm tra nhiều website
            const multiSiteTest = await this.testMultipleSites();
            
            // Test 4: Kiểm tra tốc độ
            const speedTest = await this.runSpeedTest();
            
            // Tổng kết
            this.logger.complete('🎉 Hoàn thành test proxy!');
            this.logger.info('📋 Tổng kết:');
            this.logger.info(`   • Proxy connection: ${proxyTest.success ? '✅' : '❌'}`);
            this.logger.info(`   • Target website: ${targetTest.success ? '✅' : '❌'}`);
            this.logger.info(`   • Multiple sites: ${multiSiteTest.filter(r => r.success).length}/${multiSiteTest.length} thành công`);
            this.logger.info(`   • Speed test: ${speedTest ? '✅' : '❌'}`);
            
            return {
                proxyTest,
                targetTest,
                multiSiteTest,
                speedTest
            };
            
        } catch (error) {
            this.logger.error('💥 Lỗi trong quá trình test:', error);
            throw error;
        } finally {
            await this.close();
        }
    }
}

// Chạy test
async function main() {
    const tester = new ProxyTester();
    
    try {
        await tester.run();
    } catch (error) {
        console.error('Lỗi chính:', error);
        process.exit(1);
    }
}

// Chạy nếu file được gọi trực tiếp
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main();
}

export default ProxyTester;

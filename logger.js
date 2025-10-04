import { promises as fs } from 'fs';
import path from 'path';

class Logger {
    constructor(logDir = './logs') {
        this.logDir = logDir;
        this.logFile = path.join(logDir, `crawl_${new Date().toISOString().split('T')[0]}.log`);
        this.init();
    }

    async init() {
        try {
            await fs.mkdir(this.logDir, { recursive: true });
        } catch (error) {
            // Thư mục đã tồn tại
        }
    }

    formatMessage(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            message,
            data
        };
        return JSON.stringify(logEntry);
    }

    async writeToFile(message) {
        try {
            await fs.appendFile(this.logFile, message + '\n', 'utf8');
        } catch (error) {
            console.error('Lỗi khi ghi log:', error);
        }
    }

    info(message, data = null) {
        const logMessage = this.formatMessage('INFO', message, data);
        console.log(`ℹ️ ${message}`);
        this.writeToFile(logMessage);
    }

    success(message, data = null) {
        const logMessage = this.formatMessage('SUCCESS', message, data);
        console.log(`✅ ${message}`);
        this.writeToFile(logMessage);
    }

    warning(message, data = null) {
        const logMessage = this.formatMessage('WARNING', message, data);
        console.log(`⚠️ ${message}`);
        this.writeToFile(logMessage);
    }

    error(message, data = null) {
        const logMessage = this.formatMessage('ERROR', message, data);
        console.error(`❌ ${message}`);
        this.writeToFile(logMessage);
    }

    debug(message, data = null) {
        const logMessage = this.formatMessage('DEBUG', message, data);
        console.log(`🔍 ${message}`);
        this.writeToFile(logMessage);
    }

    start(message) {
        const logMessage = this.formatMessage('START', message);
        console.log(`🚀 ${message}`);
        this.writeToFile(logMessage);
    }

    complete(message, data = null) {
        const logMessage = this.formatMessage('COMPLETE', message, data);
        console.log(`🎉 ${message}`);
        this.writeToFile(logMessage);
    }
}

export default Logger;

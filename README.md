# MSU NFT Marketplace Crawler

Crawler để lấy dữ liệu NFT từ marketplace msu.io

## Tính năng

- ✅ Crawl dữ liệu NFT từ msu.io marketplace
- ✅ Sử dụng Puppeteer để xử lý JavaScript
- ✅ Hỗ trợ proxy với authentication
- ✅ Tránh bị phát hiện với user agent và headers thật
- ✅ Xử lý lỗi và retry logic
- ✅ Lưu dữ liệu vào file JSON
- ✅ Logging chi tiết
- ✅ Cấu hình linh hoạt
- ✅ ES6 Modules
- ✅ Debug tools và test proxy

## Cài đặt

```bash
npm install
```

## Sử dụng

### Chạy crawler cơ bản

```bash
npm start
```

### Chạy với auto-reload (development)

```bash
npm run dev
```

### Sử dụng trong code

```javascript
import MSUNFTCrawler from './index.js';

const crawler = new MSUNFTCrawler();
const nftData = await crawler.run();
console.log(`Đã crawl được ${nftData.length} NFT`);
```

## Cấu trúc dữ liệu

Mỗi NFT sẽ có cấu trúc:

```json
{
  "id": 1,
  "title": "NFT Title",
  "price": "0.5 ETH",
  "image": "https://example.com/image.jpg",
  "description": "NFT description",
  "owner": "0x1234...",
  "collection": "Collection Name",
  "attributes": [],
  "url": "https://msu.io/marketplace/nft",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Cấu hình

Chỉnh sửa file `config.js` để thay đổi:

- URL cần crawl
- Selectors để tìm NFT items
- Timeout và delay
- Thư mục output
- Headers HTTP

## Output

- Dữ liệu NFT: `./data/nft_data.json`
- Logs: `./logs/crawl_YYYY-MM-DD.log`

## Xử lý lỗi

Crawler có các tính năng xử lý lỗi:

- Retry tự động khi gặp lỗi
- Timeout cho các request
- Fallback selectors khi không tìm thấy elements
- Logging chi tiết để debug

## Lưu ý

- Crawler sử dụng Puppeteer để xử lý JavaScript
- Có delay ngẫu nhiên để tránh bị phát hiện
- User agent và headers được thiết lập giống browser thật
- Cần cài đặt Chrome/Chromium để chạy Puppeteer
- Sử dụng ES6 Modules (Node.js >= 14.0.0)

// Cấu hình cho NFT Crawler
export default {
  // URL cần crawl
  baseUrl: 'https://msu.io/marketplace/nft',
  characterBaseUrl: 'https://msu.io/marketplace/character/',
  // Cấu hình browser
  browser: {
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  },


  // Cấu hình proxy
  proxy: {
    host: '51.254.78.223',
    port: 80,
    username: 'ppQHrB',
    password: 'GnrIGl',
    enabled: false
  },

  // Cấu hình crawl
  crawl: {
    timeout: 30000,
    waitForSelector: 10000,
    delay: {
      min: 1000,
      max: 3000
    },
    retry: {
      maxAttempts: 3,
      delay: 5000
    }
  },

  // Cấu hình output
  output: {
    directory: './data',
    filename: 'nft_data.json',
    format: 'json',
    directory: "./output",
    characterFilename: "characters.json"
  },

  // Selectors để tìm NFT items
  selectors: {
    // Selectors cho nhân vật (cần điều chỉnh dựa trên cấu trúc HTML thực tế)
    characterItems: [
      'article.BaseCard_itemCard__mTDZ2'
    ],
    characterName: [
      '.BaseCard_itemName__Z2GfD > div:first-child'
    ],
    characterClass: [
      '.Job_jobText__oGuaL span'
    ],
    characterLevel: [
      'span.BaseCard_starforceInCard__861PF',
      'span:has-text("Lv.")'
    ],
    characterOwner: [
      '.BaseCard_userName__I01dD'
    ],
    characterImage: [
      'img._4housa1'
    ],
    characterPrice: [
      '.CardPrice_number__OYpdb'
    ],
    nftItems: [
      'article.BaseCard_itemCard__mTDZ2',
      '._1mg8eoah',
      '[data-testid="nft-item"]',
      '.nft-item',
      '.nft-card',
      '[class*="nft"]',
      '[class*="card"]',
      '.item',
      '.product'
    ],
    title: [
      '.BaseCard_itemName__Z2GfD',
      '._1mg8eoa9 img[alt]',
      'img[alt]',
      'h1', 'h2', 'h3', 'h4',
      '.title', '.name',
      '[class*="title"]', '[class*="name"]'
    ],
    price: [
      '.CardPrice_number__OYpdb',
      '.price', '.cost',
      '[class*="price"]', '[class*="cost"]',
      '[class*="eth"]', '[class*="usd"]'
    ],
    image: [
      'img[src*="api-static.msu.io"]',
      '._1mg8eoa9 img',
      '._4housa1',
      'img'
    ],
    description: [
      '.description', '.desc',
      '[class*="description"]', 'p'
    ],
    owner: [
      '.BaseCard_userName__I01dD',
      '.owner', '.creator',
      '[class*="owner"]', '[class*="creator"]'
    ]
  }

  ,
  // Headers HTTP
  headers: {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Accept-Encoding': 'gzip, deflate',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1'
  }
};

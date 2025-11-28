const puppeteer = require('puppeteer');

// Helper delay function
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function scrapeProductImages(url) {
  console.log(`[Scraper] Opening browser for: ${url}`);

  const browser = await puppeteer.launch({
    headless: true, // ubah ke false jika mau lihat prosesnya
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled' // Anti-detection
    ]
  });

  const page = await browser.newPage();
  
  // Set user agent to avoid detection
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    console.log('[Scraper] Navigating to URL...');
    await page.goto(url, {
      waitUntil: 'domcontentloaded', // Lebih cepat - cukup untuk gambar pertama
      timeout: 30000
    });

    console.log('[Scraper] Page loaded, waiting for images...');
    
    // Tunggu singkat saja - gambar pertama biasanya sudah loaded
    await delay(100);

    console.log('[Scraper] Extracting images (first few only)...');
    const imageUrls = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      
      // Ambil hanya 3 gambar pertama untuk mempercepat
      return imgs
        .slice(0, 2)
        .map(img => {
          // Coba berbagai atribut untuk mendapatkan URL gambar
          return img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src');
        })
        .filter(src => src && src.includes('http')); // filter hanya yang valid
    });

    console.log(`[Scraper] Extracted ${imageUrls.length} image URLs (fast mode)`);
    
    await browser.close();
    return imageUrls;

  } catch (error) {
    console.error('[Scraper] Error:', error.message);
    await browser.close();
    return [];
  }
}

// Helper auto scroll biar lazy-load muncul
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let totalHeight = 0;
      const distance = 300;
      const timer = setInterval(() => {
        const { scrollHeight } = document.body;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight - window.innerHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 300);
    });
  });
}

// Export function untuk digunakan di server.js
module.exports = {
  scrapeProductImages
};

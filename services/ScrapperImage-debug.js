const puppeteer = require('puppeteer');

// Helper delay function
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function scrapeProductImages(url) {
  console.log(`[Scraper] Opening browser for: ${url}`);

  const browser = await puppeteer.launch({
    headless: false, // DEBUG: Set to false to see what's happening
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
      waitUntil: 'networkidle0', // Wait until network is completely idle
      timeout: 60000
    });

    console.log('[Scraper] Page loaded, waiting for content...');
    
    // Tunggu beberapa detik untuk memastikan JavaScript selesai render
    await delay(5000);

    console.log('[Scraper] Scrolling page...');
    // Scroll ke bawah untuk memastikan semua gambar loaded
    await autoScroll(page);
    
    // Tunggu lagi setelah scroll
    await delay(3000);

    console.log('[Scraper] Extracting images...');
    const imageUrls = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      console.log(`Found ${imgs.length} img elements in DOM`);
      
      const urls = imgs.map((img, index) => {
        // Debug: log each image
        const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src');
        console.log(`Image ${index}: src="${img.src}", data-src="${img.getAttribute('data-src')}", computed="${src}"`);
        return src;
      }).filter(src => src && src.includes('http'));
      
      console.log(`Filtered to ${urls.length} valid URLs`);
      return urls;
    });

    console.log(`[Scraper] Extracted ${imageUrls.length} valid image URLs`);
    console.log('[Scraper] Image URLs:', imageUrls);
    
    // Keep browser open for debugging
    console.log('[Scraper] Browser will close in 5 seconds...');
    await delay(5000);
    
    await browser.close();
    return imageUrls;

  } catch (error) {
    console.error('[Scraper] Error:', error.message);
    console.error('[Scraper] Stack:', error.stack);
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

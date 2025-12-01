import puppeteer from 'puppeteer';

// Helper delay function
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function scrapeProductImages(url) {
  console.log(`[Scraper] Opening browser for: ${url}`);

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled' // Anti-detection
    ]
  });

  try {
    const page = await browser.newPage();
    
    // Set user agent to avoid detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log('[Scraper] Navigating to URL...');
    await page.goto(url, {
      waitUntil: 'networkidle2', // Wait for network idle like in manual script
      timeout: 60000
    });

    console.log('[Scraper] Page loaded, looking for images...');
    
    // 1. Try specific selector from manual script
    const selector = ".image-gallery-slide.center img";
    try {
      // Short timeout for specific selector
      await page.waitForSelector(selector, { timeout: 5000 });
      const src = await page.$eval(selector, (img) => img.src);
      if (src) {
        console.log('[Scraper] Found image with specific selector');
        await browser.close();
        return [src]; // Return as array for consistency
      }
    } catch (e) {
      console.log("[Scraper] Specific selector not found, falling back to all images...");
    }

    // 2. Fallback: Extract all images
    console.log('[Scraper] Extracting all images...');
    const imageUrls = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img'));
      
      return imgs
        .map(img => {
          // Try various attributes
          return img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src');
        })
        .filter(src => src && src.includes('http') && !src.startsWith("data:")); // Filter valid URLs
    });

    console.log(`[Scraper] Extracted ${imageUrls.length} image URLs`);
    
    await browser.close();
    return imageUrls;

  } catch (error) {
    console.error('[Scraper] Error:', error.message);
    if (browser) await browser.close();
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
export default {
  scrapeProductImages
};

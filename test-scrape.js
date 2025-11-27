const puppeteer = require('puppeteer');

async function testScrape() {
  console.log('Starting Puppeteer test (Simple Config)...');
  try {
    const browser = await puppeteer.launch({
      headless: true, // Use old headless mode
      args: ['--no-sandbox'] // Minimal args
    });

    console.log('Browser launched successfully.');
    const page = await browser.newPage();
    
    const url = 'https://example.com'; 
    console.log(`Navigating to ${url}...`);
    
    await page.goto(url);
    console.log('Page loaded.');

    const title = await page.title();
    console.log(`Page title: ${title}`);

    await browser.close();
    console.log('Test completed successfully.');

  } catch (error) {
    console.error('Test failed:', error);
  }
}

testScrape();

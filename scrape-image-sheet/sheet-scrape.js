import puppeteer from "puppeteer";
import { google } from "googleapis";
import pLimit from "p-limit";

const limit = pLimit(3); // concurrency = 3

// === SETTING SPREADSHEET ===
const SPREADSHEET_ID = "1Ie4Qf4xTchnfwMTt6tKD9AAtjxmDuu1dvjVJcK_q5h8";
const RANGE = "Sheet1!G2:L"; // Ambil kolom G sampai L untuk cek apakah sudah ada gambar

const OUTPUT_COLUMN_START = "L"; // Tulis hasil ke kolom B

async function authorizeSheets() {
  const auth = new google.auth.GoogleAuth({
    keyFile: "./credentials.json",
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const client = await auth.getClient();
  return google.sheets({ version: "v4", auth: client });
}

// === SCRAPE Gambar ke-2 dari halaman ===
// === SCRAPE Gambar ke-2 dari halaman ===
async function scrapeImage(url) {
  const browser = await puppeteer.launch({
    headless: true, // tanpa buka jendela browser
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    // Set user agent to avoid bot detection
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    );
    
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    // Coba selector spesifik untuk gallery image
    const selector = ".image-gallery-slide.center img";
    try {
      await page.waitForSelector(selector, { timeout: 5000 });
      const src = await page.$eval(selector, (img) => img.src);
      if (src) return src;
    } catch (e) {
      console.log("Specific selector not found, falling back to all images...");
    }

    // Fallback: ambil semua image dan cari yang relevan
    const images = await page.$$eval("img", (imgs) =>
      imgs.map((img) => img.src).filter((src) => src && !src.startsWith("data:"))
    );

    // Biasanya image produk ada di urutan awal tapi bukan logo (index 0 usually logo)
    // Kita coba ambil index 1 atau 2
    return images[1] || images[0] || ""; 
  } catch (err) {
    console.error(`Scrape failed for ${url}:`, err.message);
    return "";
  } finally {
    await browser.close();
  }
}

// === Ambil URL dari Google Sheets ===
// === Ambil URL dari Google Sheets ===
async function getUrlsFromSheet() {
  const sheets = await authorizeSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: RANGE,
  });

  const rows = res.data.values ?? [];
  const totalRows = rows.length;

  // Map rows to include original index (0-based from the range start)
  const unprocessedRows = rows
    .map((row, index) => ({
      url: row[0], // Kolom G
      existingImage: row[5], // Kolom L (G=0, H=1, I=2, J=3, K=4, L=5)
      rowIndex: index,
    }))
    .filter((item) => {
      const hasUrl = item.url && item.url.trim() !== "";
      // Check if image column exists and is not just whitespace
      const hasImage = item.existingImage && item.existingImage.trim() !== "";
      return hasUrl && !hasImage;
    });

  console.log(`Total rows checked: ${totalRows}`);
  console.log(`Skipped (already processed): ${totalRows - unprocessedRows.length}`);
  console.log(`Remaining to process: ${unprocessedRows.length}`);

  return unprocessedRows;
}

// === Update hasil kembali ke spreadsheet ===
async function updateToSheet(row, value) {
  const sheets = await authorizeSheets();
  const range = `Sheet1!${OUTPUT_COLUMN_START}${row + 2}`;

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueInputOption: "RAW",
    requestBody: { values: [[value]] },
  });
}

// === Main Execution ===
async function runBatch(spreadsheetId = SPREADSHEET_ID, onProgress) {
  console.log(`[Batch] Start reading URLs from Sheet ID: ${spreadsheetId}...`);
  
  // Override global SPREADSHEET_ID if provided
  const targetSpreadsheetId = spreadsheetId || SPREADSHEET_ID;

  // Custom getUrlsFromSheet that uses the provided ID
  const getUrls = async () => {
    const sheets = await authorizeSheets();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: targetSpreadsheetId,
      range: RANGE,
    });

    const rows = res.data.values ?? [];
    const totalRows = rows.length;

    const unprocessedRows = rows
      .map((row, index) => ({
        url: row[0], 
        existingImage: row[5], 
        rowIndex: index,
      }))
      .filter((item) => {
        const hasUrl = item.url && item.url.trim() !== "";
        const hasImage = item.existingImage && item.existingImage.trim() !== "";
        return hasUrl && !hasImage;
      });

    console.log(`Total rows checked: ${totalRows}`);
    console.log(`Remaining to process: ${unprocessedRows.length}`);
    return unprocessedRows;
  };

  // Custom updateToSheet that uses the provided ID
  const updateSheet = async (row, value) => {
    const sheets = await authorizeSheets();
    const range = `Sheet1!${OUTPUT_COLUMN_START}${row + 2}`;
    await sheets.spreadsheets.values.update({
      spreadsheetId: targetSpreadsheetId,
      range,
      valueInputOption: "RAW",
      requestBody: { values: [[value]] },
    });
  };

  const allUrls = await getUrls();
  console.log(`Found ${allUrls.length} unprocessed rows.`);

  // Initial progress update
  if (onProgress) {
    onProgress({ 
      type: 'start', 
      total: allUrls.length,
      message: `Found ${allUrls.length} unprocessed rows.`
    });
  }

  let processedCount = 0;

  const tasks = allUrls.map((item) =>
    limit(async () => {
      console.log(`Scraping row ${item.rowIndex + 2}: ${item.url}`);
      let result = { id: item.rowIndex, success: false };

      try {
        const imageUrl = await scrapeImage(item.url);
        
        if (imageUrl) {
          console.log("Image URL : "+imageUrl);
          await updateSheet(item.rowIndex, imageUrl);
          console.log(`✔ Updated row ${item.rowIndex + 2} → ${imageUrl}`);
          result = { id: item.rowIndex, success: true, url: imageUrl };
        } else {
          console.log(`✘ Failed row ${item.rowIndex + 2}`);
          result = { id: item.rowIndex, success: false, error: "No image found" };
        }
      } catch (e) {
        console.error(`Error processing row ${item.rowIndex + 2}:`, e);
        result = { id: item.rowIndex, success: false, error: e.message };
      }

      processedCount++;
      
      if (onProgress) {
        onProgress({
          type: 'progress',
          processed: processedCount,
          total: allUrls.length,
          result: result,
          message: `Processed ${processedCount}/${allUrls.length}`
        });
      }

      return result;
    })
  );

  const results = await Promise.all(tasks);
  console.log("\n🔥 DONE! Semua hasil tersimpan di Spreadsheet!");
  
  if (onProgress) {
    onProgress({
      type: 'complete',
      processed: processedCount,
      total: allUrls.length,
      results: results,
      message: "Batch scraping completed!"
    });
  }

  return results;
}

// Export the functions
export { scrapeImage, runBatch };

// Only run if directly executed (ESM check)
// if (import.meta.url === `file://${process.argv[1]}`) {
//   runBatch().catch(console.error);
// }


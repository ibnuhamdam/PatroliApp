import express from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';
import sheetsService from './services/sheetsService.js';
import scrapperImageService from './services/ScrapperImage.js';
import axios from 'axios';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// console.log(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Storage untuk upload file
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = './uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    if (ext !== '.xlsx' && ext !== '.xls') {
      return cb(new Error('Hanya file Excel yang diperbolehkan!'));
    }
    cb(null, true);
  }
});

// Data storage (in-memory untuk demo)
let productsData = [];
let currentFileName = '';
let currentSpreadsheetId = '';

// Endpoint: Upload dan parse Excel
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'File tidak ditemukan' });
    }

    currentFileName = req.file.filename;
    const filePath = req.file.path;

    // Baca file Excel
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    // Validasi kolom yang diperlukan
    const requiredColumns = ['kategori_lv1', 'kategori_lv2', 'kategori_lv3', 'nama_produk','url_produk', 'hasil_pemeriksa','reviewer', 'pemeriksa'];
    if (data.length > 0) {
      const columns = Object.keys(data[0]);
      const missingColumns = requiredColumns.filter(col => !columns.includes(col));
      
      if (missingColumns.length > 0) {
        return res.status(400).json({ 
          error: `Kolom tidak lengkap. Kolom yang hilang: ${missingColumns.join(', ')}` 
        });
      }
    }

    // Validasi nilai Hasil Pemeriksaan
    const invalidRows = [];
    // console.log(data)
    data.forEach((item, index) => {
      const hasilPemeriksaan = item['hasil_pemeriksa'];
      if (hasilPemeriksaan && !['Sesuai', 'Tidak Sesuai'].includes(hasilPemeriksaan)) {
        invalidRows.push(index + 2); // +2 karena row 1 adalah header, index mulai dari 0
      }

      // console.log(hasilPemeriksaan);
    });

    if (invalidRows.length > 0) {
      return res.status(400).json({ 
        error: `Kolom "Hasil Pemeriksaan" harus diisi dengan "Sesuai" atau "Tidak Sesuai". Baris yang bermasalah: ${invalidRows.join(', ')}` 
      });
    }

    // Validasi Pemeriksa tidak boleh kosong
    const emptyPemeriksa = [];
    data.forEach((item, index) => {
      if (!item['pemeriksa'] || item['pemeriksa'].toString().trim() === '') {
        emptyPemeriksa.push(index + 2);
      }
    });

    if (emptyPemeriksa.length > 0) {
      return res.status(400).json({ 
        error: `Kolom "Pemeriksa" wajib diisi. Baris yang bermasalah: ${emptyPemeriksa.join(', ')}` 
      });
    }

    // Transform data dengan ID unik
    productsData = data.map((item, index) => ({
      id: index + 1,
      kategoriLv1: item['kategori_lv1'] || '',
      kategoriLv2: item['kategori_lv2'] || '',
      kategoriLv3: item['kategori_lv3'] || '',
      namaProduk: item['nama_produk'] || '',
      urlImage: item['gambar_produk'] || item['image_url'] || item['url_image'] || '',
      urlProduk: item['url_produk'] || '',
      hasilPemeriksaan: item['hasil_pemeriksa'] || '', // MANDATORY - read-only
      hasilReview: item['hasil_review'] || null,   // Will be filled via app
      pemeriksa: item['pemeriksa'] || '',          // MANDATORY
      reviewer: item['reviewer'] || '',          // MANDATORY
      reviewed: item['hasil_review'] ? true : false // Track if reviewed
    }));

    res.json({
      success: true,
      message: `Berhasil memuat ${productsData.length} produk`,
      totalProducts: productsData.length,
      fileName: req.file.originalname
    });

  } catch (error) {
    console.error('Error parsing Excel:', error);
    res.status(500).json({ error: 'Gagal memproses file Excel: ' + error.message });
  }
});

// Endpoint: Get semua produk
app.get('/api/products', (req, res) => {
  // Pagination params
  const pageUnreviewed = parseInt(req.query.pageUnreviewed) || 1;
  const limitUnreviewed = parseInt(req.query.limitUnreviewed) || 10;
  const pageReviewed = parseInt(req.query.pageReviewed) || 1;
  const limitReviewed = parseInt(req.query.limitReviewed) || 10;
  
  const reviewer = req.query.reviewer;
  const category = req.query.category; // New: Category filter
  const searchQuery = req.query.search ? req.query.search.toLowerCase() : '';

  // Filter empty hasil pemeriksaan
  const validProducts = productsData.filter(p => p.hasilPemeriksaan && p.hasilPemeriksaan.toString().trim() !== '');

  // 1. Filter by Reviewer
  let filteredProducts = validProducts;
  if (reviewer) {
    filteredProducts = validProducts.filter(p => p.reviewer === reviewer);
  }

  // 2. Filter by Category (New)
  if (category) {
    filteredProducts = filteredProducts.filter(p => p.kategoriLv3 === category);
  }

  // 3. Filter by Search Query (Product Name)
  if (searchQuery) {
    filteredProducts = filteredProducts.filter(p => 
      p.namaProduk.toLowerCase().includes(searchQuery)
    );
  }

  // 4. Split into Reviewed and Unreviewed
  const unreviewed = filteredProducts.filter(p => !p.reviewed);
  const reviewed = filteredProducts.filter(p => p.reviewed);

  // 5. Pagination for UNREVIEWED
  const totalUnreviewed = unreviewed.length;
  const startUnreviewed = (pageUnreviewed - 1) * limitUnreviewed;
  const endUnreviewed = pageUnreviewed * limitUnreviewed;
  const paginatedUnreviewed = unreviewed.slice(startUnreviewed, endUnreviewed);
  const totalPagesUnreviewed = Math.ceil(totalUnreviewed / limitUnreviewed);

  // 6. Pagination for REVIEWED
  // Sort reviewed by most recently updated (simulated by reverse array order)
  const reviewedSorted = [...reviewed].reverse(); 
  
  const totalReviewed = reviewedSorted.length;
  const startReviewed = (pageReviewed - 1) * limitReviewed;
  const endReviewed = pageReviewed * limitReviewed;
  const paginatedReviewed = reviewedSorted.slice(startReviewed, endReviewed);
  const totalPagesReviewed = Math.ceil(totalReviewed / limitReviewed);

  // Stats (based on filtered data or global data? Usually global for the reviewer is better context)
  // Let's keep stats based on the REVIEWER context, ignoring search/category for the general stats, 
  // so the user sees their overall progress.
  
  // Re-calculate stats based on Reviewer ONLY (ignoring search/category query for the stats cards)
  const reviewerProducts = validProducts.filter(p => p.reviewer === reviewer);
  const reviewerReviewed = reviewerProducts.filter(p => p.reviewed);

  const stats = {
    total: reviewerProducts.length,
    reviewed: reviewerReviewed.length,
    sesuai: reviewerReviewed.filter(p => p.hasilReview === 'Benar').length,
    tidakSesuai: reviewerReviewed.filter(p => p.hasilReview === 'Salah').length,
    cocok: reviewerReviewed.filter(p => p.hasilReview && 
      ((p.hasilReview === 'Benar' && p.hasilPemeriksaan === 'Sesuai') || 
       (p.hasilReview === 'Salah' && p.hasilPemeriksaan === 'Tidak Sesuai'))
    ).length,
    tidakCocok: reviewerReviewed.filter(p => p.hasilReview && 
      ((p.hasilReview === 'Benar' && p.hasilPemeriksaan === 'Tidak Sesuai') || 
       (p.hasilReview === 'Salah' && p.hasilPemeriksaan === 'Sesuai'))
    ).length
  };

  res.json({
    unreviewed: paginatedUnreviewed,
    reviewed: paginatedReviewed,
    stats: stats,
    pagination: {
      unreviewed: {
        currentPage: pageUnreviewed,
        totalPages: totalPagesUnreviewed || 1,
        totalItems: totalUnreviewed
      },
      reviewed: {
        currentPage: pageReviewed,
        totalPages: totalPagesReviewed || 1,
        totalItems: totalReviewed
      }
    }
  });
});

// Endpoint: Get list kategori Lv 3
app.get('/api/categories', (req, res) => {
  const reviewer = req.query.reviewer;
  
  const validProducts = productsData.filter(p => p.hasilPemeriksaan && p.hasilPemeriksaan.toString().trim() !== '');

  let filteredProducts = validProducts;
  if (reviewer) {
    filteredProducts = validProducts.filter(p => p.reviewer === reviewer);
  }

  // Ambil unique kategori Lv 3
  const categories = [...new Set(filteredProducts.map(p => p.kategoriLv3))].sort();
  
  res.json(categories);
});

// Endpoint: Get produk by ID
app.get('/api/products/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const product = productsData.find(p => p.id === id);
  
  if (!product) {
    return res.status(404).json({ error: 'Produk tidak ditemukan' });
  }
  
  res.json(product);
});

// Endpoint: Update hasil review (bukan hasil pemeriksaan)
app.put('/api/products/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const { hasilReview } = req.body;
  
  const productIndex = productsData.findIndex(p => p.id === id);
  
  if (productIndex === -1) {
    return res.status(404).json({ error: 'Produk tidak ditemukan' });
  }
  
  if (!['Benar', 'Salah'].includes(hasilReview)) {
    return res.status(400).json({ error: 'Hasil review harus "Benar" atau "Salah"' });
  }
  
  productsData[productIndex].hasilReview = hasilReview;
  productsData[productIndex].reviewed = true;
  
  res.json({
    success: true,
    product: productsData[productIndex]
  });
});

// Endpoint: Download hasil verifikasi
app.get('/api/download', (req, res) => {
  try {
    if (productsData.length === 0) {
      return res.status(400).json({ error: 'Tidak ada data untuk didownload' });
    }

    // Transform data kembali ke format Excel
    const excelData = productsData.map(item => ({
      'Kategori Lv 1': item.kategoriLv1,
      'Kategori Lv 2': item.kategoriLv2,
      'Kategori Lv 3': item.kategoriLv3,
      'Nama Produk': item.namaProduk,
      'Hasil Pemeriksaan': item.hasilPemeriksaan,
      'Review Validator': item.hasilReview || '', // Changed header to be more clear
      'Pemeriksa': item.pemeriksa
    }));

    // Buat workbook baru
    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Hasil Patroli');

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Set headers untuk download
    res.setHeader('Content-Disposition', 'attachment; filename=hasil-patroli-' + Date.now() + '.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    
    res.send(buffer);

  } catch (error) {
    console.error('Error generating Excel:', error);
    res.status(500).json({ error: 'Gagal membuat file Excel: ' + error.message });
  }
});

// Endpoint: Get statistik
app.get('/api/stats', (req, res) => {
  const reviewer = req.query.reviewer;
  
  // Filter products by reviewer if specified
  const validProducts = productsData.filter(p => p.hasilPemeriksaan && p.hasilPemeriksaan.toString().trim() !== '');

  let filteredProducts = validProducts;
  if (reviewer) {
    filteredProducts = validProducts.filter(p => p.reviewer === reviewer);
  }

  const stats = {
    total: filteredProducts.length,
    reviewed: filteredProducts.filter(p => p.reviewed).length,
    belumReview: filteredProducts.filter(p => !p.reviewed).length,
    benar: filteredProducts.filter(p => p.hasilReview === 'Benar').length,
    salah: filteredProducts.filter(p => p.hasilReview === 'Salah').length
  };
  
  res.json(stats);
});

// Endpoint: Reset data
app.post('/api/reset', (req, res) => {
  productsData = [];
  currentFileName = '';
  res.json({ success: true, message: 'Data berhasil direset' });
});

// Endpoint: AI Product Explanation
app.post('/api/ai/explain-product', async (req, res) => {
  try {
    const { productName } = req.body;
    const { categoryName } = req.body;
    
    if (!productName) {
      return res.status(400).json({ error: 'Nama produk diperlukan' });
    }

    const rules1 = "Jika produk mencamtumkan kata seperti custom, cetak dan kata lain yang mengarah pada kegiatan jasa, maka dipastikan tidak sesuai"
    // const rules2 = ""

    const prompt = `Jelaskan secara singkat apa itu produk "${productName}" dalam 2-3 kalimat. Fokus pada fungsi dan kegunaan produk. dan apakah produk "${productName}" dapat dikategorikan dalam kategori "${categoryName}"?. Dengan catatan ${rules1}`;
    console.log(prompt);
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const explanation = response.text();
    
    res.json({ 
      success: true,
      productName: productName,
      explanation: explanation
    });

  } catch (error) {
    console.error('Error calling Gemini API:', error);
    res.status(500).json({ 
      error: 'Gagal mendapatkan penjelasan dari AI',
      message: error.message 
    });
  }
});

// Endpoint: Read from Google Sheets
app.post('/api/sheets/read', async (req, res) => {
  try {
    const { spreadsheetId } = req.body;
    
    if (!spreadsheetId) {
      return res.status(400).json({ error: 'Spreadsheet ID diperlukan' });
    }

    const data = await sheetsService.readSpreadsheet(spreadsheetId);

    // console.log(req.body.reviewerName);
    
    // Check if data is valid
    if (!data) {
      return res.status(500).json({ error: 'Gagal membaca data dari Google Sheets. Pastikan spreadsheet dapat diakses.' });
    }

    // Check if data is empty
    if (data.length === 0) {
      return res.status(400).json({ error: 'Spreadsheet kosong atau tidak memiliki data.' });
    }
    
    // Validasi kolom yang diperlukan
    const requiredColumns = ['kategori_lv1', 'kategori_lv2', 'kategori_lv3', 'nama_produk','url_produk', 'hasil_pemeriksa','reviewer', 'pemeriksa'];
    if (data.length > 0) {
      const columns = Object.keys(data[0]);
      const missingColumns = requiredColumns.filter(col => !columns.includes(col));
      
      if (missingColumns.length > 0) {
        return res.status(400).json({ 
          error: `Kolom tidak lengkap. Kolom yang hilang: ${missingColumns.join(', ')}` 
        });
      }
    }

    // Validasi nilai Hasil Pemeriksaan
    const invalidRows = [];
    data.forEach((item, index) => {
      const hasilPemeriksaan = item['hasil_pemeriksa'];
      if (hasilPemeriksaan && !['Sesuai', 'Tidak Sesuai'].includes(hasilPemeriksaan)) {
        invalidRows.push(index + 2);
      }
    });

    if (invalidRows.length > 0) {
      return res.status(400).json({ 
        error: `Kolom "Hasil Pemeriksaan" harus diisi dengan "Sesuai" atau "Tidak Sesuai". Baris yang bermasalah: ${invalidRows.join(', ')}` 
      });
    }

    // Validasi Pemeriksa
    const emptyPemeriksa = [];
    data.forEach((item, index) => {
      if (!item['pemeriksa'] || item['pemeriksa'].toString().trim() === '') {
        emptyPemeriksa.push(index + 2);
      }
    });

    if (emptyPemeriksa.length > 0) {
      return res.status(400).json({ 
        error: `Kolom "Pemeriksa" wajib diisi. Baris yang bermasalah: ${emptyPemeriksa.join(', ')}` 
      });
    }

    // Transform data
    productsData = data.map((item, index) => ({
      id: index + 1,
      kategoriLv1: item['kategori_lv1'] || '',
      kategoriLv2: item['kategori_lv2'] || '',
      kategoriLv3: item['kategori_lv3'] || '',
      namaProduk: item['nama_produk'] || '',
      urlImage: item['gambar_produk'] || item['image_url'] || item['url_image'] || '',
      urlProduk: item['url_produk'] || '',
      hasilPemeriksaan: item['hasil_pemeriksa'] || '',
      hasilReview: item['Review Validator'] || item['hasil_review'] || null, // Check both new and old column names
      pemeriksa: item['pemeriksa'] || '',
      reviewer: item['reviewer'] || '',
      reviewed: (item['Review Validator'] || item['hasil_review']) ? true : false
    }));

    currentSpreadsheetId = spreadsheetId;
    currentFileName = `Google Sheet (${spreadsheetId})`;

    res.json({
      success: true,
      message: `Berhasil memuat ${productsData.length} produk dari Google Sheets`,
      totalProducts: productsData.length,
      fileName: currentFileName
    });

  } catch (error) {
    console.error('Error reading sheet:', error);
    res.status(500).json({ error: 'Gagal membaca Google Sheet: ' + error.message });
  }
});

// Endpoint: Update Google Sheets (Only hasil_review column)
app.post('/api/sheets/update', async (req, res) => {
  try {
    const { spreadsheetId } = req.body;
    
    if (!spreadsheetId) {
      return res.status(400).json({ error: 'Spreadsheet ID diperlukan' });
    }

    if (productsData.length === 0) {
      return res.status(400).json({ error: 'Tidak ada data untuk diupdate' });
    }

    // Filter only products that have been reviewed (hasilReview is not null/empty)
    const reviewedProducts = productsData.filter(p => p.hasilReview && p.hasilReview.trim() !== '');
    
    if (reviewedProducts.length === 0) {
      return res.status(400).json({ error: 'Tidak ada produk yang sudah direview' });
    }

    console.log(`[Update Sheets] Updating ${reviewedProducts.length} reviewed products`);

    // Get Google Sheets auth
    const auth = new google.auth.GoogleAuth({
      keyFile: './credentials.json',
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const sheets = google.sheets({ version: 'v4', auth });

    // Read header to find hasil_review column index
    const headerResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!1:1',
    });

    const headers = headerResponse.data.values ? headerResponse.data.values[0] : [];
    let reviewColIndex = headers.indexOf('hasil_review');

    // If column doesn't exist, create it by appending to the next available column
    if (reviewColIndex === -1) {
      reviewColIndex = headers.length;
      const newColLetter = getColumnLetter(reviewColIndex + 1);
      
      // Only update the specific cell for the new header
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Sheet1!${newColLetter}1`,
        valueInputOption: 'RAW',
        resource: { values: [['hasil_review']] },
      });
      
      // Update local headers array to reflect change
      headers.push('hasil_review');
      console.log(`[Update Sheets] Created hasil_review column at ${newColLetter}1`);
    }

    // Read all data to match products by url_produk
    const dataResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'Sheet1!A:Z',
    });

    const allRows = dataResponse.data.values || [];
    const urlProdukIndex = headers.indexOf('url_produk');

    if (urlProdukIndex === -1) {
      return res.status(400).json({ error: 'Kolom url_produk tidak ditemukan di spreadsheet' });
    }

    // Update each reviewed product
    const dataToUpdate = [];
    const colLetter = getColumnLetter(reviewColIndex + 1);

    for (const product of reviewedProducts) {
      // Find matching row by url_produk (unique enough and available)
      const targetUrl = String(product.urlProduk).trim();
      
      if (!targetUrl) {
        console.log(`[Update Sheets] Skipping product with empty URL: ${product.namaProduk}`);
        continue;
      }

      const rowIndex = allRows.findIndex((row, idx) => {
        if (idx === 0) return false; // Skip header
        const sheetUrl = row[urlProdukIndex] ? String(row[urlProdukIndex]).trim() : '';
        return sheetUrl === targetUrl;
      });

      if (rowIndex !== -1) {
        const actualRowNumber = rowIndex + 1; // 1-based
        const range = `Sheet1!${colLetter}${actualRowNumber}`;
        
        // Collect update data instead of sending immediately
        dataToUpdate.push({
          range: range,
          values: [[product.hasilReview]]
        });

        // console.log(`[Update Sheets] Queued update for row ${actualRowNumber}: URL ${targetUrl} = ${product.hasilReview}`);
      } else {
        console.log(`[Update Sheets] WARNING: Product URL ${targetUrl} not found in sheet!`);
      }
    }

    if (dataToUpdate.length > 0) {
      console.log(`[Update Sheets] Sending batch update for ${dataToUpdate.length} cells...`);
      
      await sheets.spreadsheets.values.batchUpdate({
        spreadsheetId,
        resource: {
          valueInputOption: 'RAW',
          data: dataToUpdate
        }
      });
      
      console.log(`[Update Sheets] Batch update success!`);
    }
    
    res.json({
      success: true,
      message: `Berhasil mengupdate ${dataToUpdate.length} produk di Google Sheet`
    });

  } catch (error) {
    console.error('Error updating sheet:', error);
    res.status(500).json({ error: 'Gagal mengupdate Google Sheet: ' + error.message });
  }
});

// Helper function to convert column index to letter (A, B, C, ..., Z, AA, AB, ...)
function getColumnLetter(columnNumber) {
  let letter = '';
  while (columnNumber > 0) {
    const remainder = (columnNumber - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    columnNumber = Math.floor((columnNumber - 1) / 26);
  }
  return letter;
}

// Endpoint: Scrape Image (Using ScrapperImage Service)
app.post('/api/scrape-image', async (req, res) => {
  const { productId, url } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL produk diperlukan' });
  }

  console.log(`[Scraper] Processing product ${productId}: ${url}`);

  try {
    // Gunakan service ScrapperImage untuk mendapatkan semua URL gambar
    const imageUrls = await scrapperImageService.scrapeProductImages(url);
    
    if (!imageUrls || imageUrls.length === 0) {
      return res.status(404).json({ 
        error: 'Tidak ada gambar ditemukan di halaman produk',
        totalImages: 0
      });
    }

    console.log(`[Scraper] Found ${imageUrls.length} images`);
    
    // Ambil gambar ke-2 (index 1) atau gambar terakhir jika kurang dari 2
    // Index 1 biasanya adalah gambar produk utama
    const targetIndex = 1; // Index ke-2 (0-based)
    const selectedImageUrl = imageUrls.length > targetIndex 
      ? imageUrls[targetIndex] 
      : imageUrls[imageUrls.length - 1]; // Fallback ke gambar terakhir
    
    console.log(`[Scraper] Selected image at index ${Math.min(targetIndex, imageUrls.length - 1)}: ${selectedImageUrl}`);
    
    // Update in-memory data
    const product = productsData.find(p => p.id === parseInt(productId));
    if (product) {
      product.urlImage = selectedImageUrl;
    }

    return res.json({ 
      success: true, 
      urlImage: selectedImageUrl,
      totalImages: imageUrls.length,
      selectedIndex: Math.min(targetIndex, imageUrls.length - 1),
      allImages: imageUrls, // Kirim semua gambar untuk debugging
      source: 'scrapperImageService'
    });

  } catch (error) {
    console.error(`[Scraper] Error scraping ${url}: ${error.message}`);
    res.status(500).json({ 
      error: 'Gagal mengambil gambar: ' + error.message,
      details: error.stack
    });
  }
});

// Endpoint: Batch Scrape Images (SSE Streaming)
app.get('/api/scrape-batch-stream', async (req, res) => {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const spreadsheetId = req.query.spreadsheetId || currentSpreadsheetId;

  try {
    console.log('[Batch Scraper] Starting batch scraping stream...');
    
    // Dynamic import for ESM module
    const { runBatch } = await import('./scrape-image-sheet/sheet-scrape.js');

    console.log(`[Batch Scraper] Triggering runBatch for Sheet ID: ${spreadsheetId || 'Default'}`);

    // Run the batch process with progress callback
    await runBatch(spreadsheetId, (progress) => {
      // Send progress event
      res.write(`data: ${JSON.stringify(progress)}\n\n`);
    });

    // Send final event
    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();

  } catch (error) {
    console.error('[Batch Scraper] Error:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
    res.end();
  }
});

// Keep the POST endpoint for backward compatibility or simple triggering if needed
// But for progress bar, we will use the GET stream endpoint
app.post('/api/scrape-batch', async (req, res) => {
   res.json({ success: true, message: "Use /api/scrape-batch-stream for progress updates" });
});

app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});

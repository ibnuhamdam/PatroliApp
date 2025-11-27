const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const sheetsService = require('./services/sheetsService');
const axios = require('axios');
const cheerio = require('cheerio');
const puppeteer = require('puppeteer');
const env = require('dotenv').config();

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
    const requiredColumns = ['kategori_lv1', 'kategori_lv2', 'kategori_lv3', 'nama_produk','url_produk', 'hasil pemeriksa','reviewer', 'pemeriksa'];
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
      const hasilPemeriksaan = item['hasil pemeriksa'];
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
      urlImage: item['url_image'] || '',
      urlProduk: item['url_produk'] || '',
      hasilPemeriksaan: item['hasil pemeriksa'] || '', // MANDATORY - read-only
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
  const searchQuery = req.query.search ? req.query.search.toLowerCase() : '';

  // 1. Filter by Reviewer
  let filteredProducts = productsData;
  if (reviewer) {
    filteredProducts = productsData.filter(p => p.reviewer === reviewer);
  }

  // 2. Filter by Search Query (Product Name)
  if (searchQuery) {
    filteredProducts = filteredProducts.filter(p => 
      p.namaProduk.toLowerCase().includes(searchQuery)
    );
  }

  // 3. Split into Reviewed and Unreviewed
  const unreviewed = filteredProducts.filter(p => !p.reviewed);
  const reviewed = filteredProducts.filter(p => p.reviewed);

  // 4. Pagination for UNREVIEWED
  const totalUnreviewed = unreviewed.length;
  const startUnreviewed = (pageUnreviewed - 1) * limitUnreviewed;
  const endUnreviewed = pageUnreviewed * limitUnreviewed;
  const paginatedUnreviewed = unreviewed.slice(startUnreviewed, endUnreviewed);
  const totalPagesUnreviewed = Math.ceil(totalUnreviewed / limitUnreviewed);

  // 5. Pagination for REVIEWED
  // Sort reviewed by most recently updated (simulated by reverse array order)
  // Note: If we want consistent pagination, we should sort by ID or something stable if we had timestamps.
  // For now, reverse is fine assuming append-only log.
  const reviewedSorted = [...reviewed].reverse(); 
  
  const totalReviewed = reviewedSorted.length;
  const startReviewed = (pageReviewed - 1) * limitReviewed;
  const endReviewed = pageReviewed * limitReviewed;
  const paginatedReviewed = reviewedSorted.slice(startReviewed, endReviewed);
  const totalPagesReviewed = Math.ceil(totalReviewed / limitReviewed);

  // Stats (based on filtered data or global data? Usually global for the reviewer is better context)
  // Let's keep stats based on the REVIEWER context, ignoring search for the general stats, 
  // OR we can make stats reflect the search. Let's stick to Reviewer context stats (ignoring search) 
  // so the user sees their overall progress.
  
  // Re-calculate stats based on Reviewer ONLY (ignoring search query for the stats cards)
  const reviewerProducts = productsData.filter(p => p.reviewer === reviewer);
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
  let filteredProducts = productsData;
  if (reviewer) {
    filteredProducts = productsData.filter(p => p.reviewer === reviewer);
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

    const prompt = `Jelaskan secara singkat apa itu produk "${productName}" dalam 2-3 kalimat. Fokus pada fungsi dan kegunaan produk tersebut dalam konteks perkantoran atau bisnis. dan apakah produk "${productName}" dapat dikategorikan dalam kategori "${categoryName}"? Gunakan Bahasa Indonesia yang mudah dipahami.`;
    
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
    const requiredColumns = ['kategori_lv1', 'kategori_lv2', 'kategori_lv3', 'nama_produk','url_produk', 'hasil pemeriksa','reviewer', 'pemeriksa'];
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
      const hasilPemeriksaan = item['hasil pemeriksa'];
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
      urlImage: item['url_image'] || '',
      urlProduk: item['url_produk'] || '',
      hasilPemeriksaan: item['hasil pemeriksa'] || '',
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

// Endpoint: Update Google Sheets
app.post('/api/sheets/update', async (req, res) => {
  try {
    const { spreadsheetId } = req.body;
    
    if (!spreadsheetId) {
      return res.status(400).json({ error: 'Spreadsheet ID diperlukan' });
    }

    if (productsData.length === 0) {
      return res.status(400).json({ error: 'Tidak ada data untuk diupdate' });
    }

    const result = await sheetsService.updateSpreadsheet(spreadsheetId, productsData);
    
    res.json({
      success: true,
      message: `Berhasil mengupdate baris di Google Sheet`
    });

  } catch (error) {
    console.error('Error updating sheet:', error);
    res.status(500).json({ error: 'Gagal mengupdate Google Sheet: ' + error.message });
  }
});

// Endpoint: Scrape Image (Puppeteer with Cheerio Fallback)
app.post('/api/scrape-image', async (req, res) => {
  const { productId, url } = req.body;
  
  if (!url) {
    return res.status(400).json({ error: 'URL produk diperlukan' });
  }

  console.log(`[Scraper] Processing product ${productId}: ${url}`);

  // Helper function to extract image from HTML string using Cheerio
  const extractImageWithCheerio = (html) => {
    const $ = cheerio.load(html);
    
    // Helper to check if image is likely a logo or icon
    const isLikelyUseless = (src, alt, className) => {
      const s = (src || '').toLowerCase();
      const a = (alt || '').toLowerCase();
      const c = (className || '').toLowerCase();
      
      return s.includes('logo') || 
             s.includes('icon') || 
             s.includes('assets') || // Common for static assets
             a.includes('logo') || 
             c.includes('logo') ||
             c.includes('icon');
    };

    // Priority 1: OG Image
    const ogImage = $('meta[property="og:image"]').attr('content');
    if (ogImage) return ogImage;
    
    // Priority 2: Twitter Image
    const twitterImage = $('meta[name="twitter:image"]').attr('content');
    if (twitterImage) return twitterImage;
    
    // Priority 3: JSON-LD (Schema.org)
    let schemaImage = null;
    $('script[type="application/ld+json"]').each((i, elem) => {
      try {
        const data = JSON.parse($(elem).html());
        if (data.image) {
          if (Array.isArray(data.image)) schemaImage = data.image[0];
          else if (typeof data.image === 'string') schemaImage = data.image;
          else if (data.image.url) schemaImage = data.image.url;
        }
      } catch (e) {}
    });
    if (schemaImage) return schemaImage;

    // Priority 4: Common Product Selectors
    const selectors = [
      '.product-image img',
      '.product-detail img',
      '.gallery-image img',
      '.main-image img',
      'img[itemprop="image"]',
      '.sticky-section-image img',
      '#product-image',
      '.img-product'
    ];

    for (const selector of selectors) {
      const img = $(selector).first();
      if (img.length) {
        const src = img.attr('src') || img.attr('data-src') || img.attr('data-original');
        if (src && !isLikelyUseless(src, img.attr('alt'), img.attr('class'))) {
          return src;
        }
      }
    }
    
    // Priority 5: Largest Image Heuristic
    let largestImg = null;
    // This is hard with Cheerio as we don't have dimensions. 
    // We'll just look for the first substantial image in the body that isn't a logo.
    let foundImg = null;
    $('img').each((i, elem) => {
      if (foundImg) return; // Stop after finding one
      const src = $(elem).attr('src');
      if (src && !isLikelyUseless(src, $(elem).attr('alt'), $(elem).attr('class'))) {
        foundImg = src;
      }
    });

    return foundImg;
  };

  // Strategy 1: Try Cheerio/Axios first (Faster, less resource intensive)
  try {
    console.log(`[Scraper] Attempting Strategy 1: Axios + Cheerio for ${url}`);
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
        'Referer': 'https://www.google.com/'
      },
      timeout: 10000 // 10s timeout for Axios
    });

    const imageUrl = extractImageWithCheerio(response.data);
    if (imageUrl) {
      console.log(`[Scraper] Found image via Cheerio: ${imageUrl}`);
      
      // Update in-memory data
      const product = productsData.find(p => p.id === parseInt(productId));
      if (product) product.urlImage = imageUrl;

      return res.json({ success: true, urlImage: imageUrl, source: 'cheerio' });
    }
    console.log(`[Scraper] Cheerio found no image. Falling back to Puppeteer...`);

  } catch (error) {
    console.warn(`[Scraper] Axios/Cheerio failed: ${error.message}. Falling back to Puppeteer...`);
  }

  // Strategy 2: Puppeteer (Fallback for dynamic sites)
  try {
    console.log(`[Scraper] Attempting Strategy 2: Puppeteer for ${url}`);
    
    const browser = await puppeteer.launch({
      headless: true, // Use new headless mode if available, or true
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined, // Use system chromium if env var is set
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-extensions',
        '--disable-blink-features=AutomationControlled' // Stealth mode
      ],
      timeout: 30000
    });
    
    const page = await browser.newPage();
    
    // Optimize: Block resources
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['font', 'stylesheet', 'media'].includes(req.resourceType())) {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9,id;q=0.8'
    });
    
    // Navigate
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Extract
    const imageUrl = await page.evaluate(() => {
      const isLikelyUseless = (img) => {
        const src = img.src.toLowerCase();
        const alt = (img.alt || '').toLowerCase();
        const className = (img.className || '').toLowerCase();
        
        return src.includes('logo') || 
               src.includes('icon') || 
               alt.includes('logo') || 
               className.includes('logo') ||
               className.includes('icon') ||
               img.width < 50 || 
               img.height < 50;
      };

      // Priority 1: OG/Twitter
      const og = document.querySelector('meta[property="og:image"]');
      if (og && og.content) return og.content;
      
      const tw = document.querySelector('meta[name="twitter:image"]');
      if (tw && tw.content) return tw.content;

      // Priority 2: Selectors
      const selectors = [
        '.product-image img', '.product-detail img', '.gallery-image img', 
        '.main-image img', 'img[itemprop="image"]', '.sticky-section-image img'
      ];
      
      for (const sel of selectors) {
        const img = document.querySelector(sel);
        if (img && img.src && !isLikelyUseless(img)) return img.src;
      }

      // Priority 3: Largest Image
      const allImages = Array.from(document.querySelectorAll('img'));
      let largestImg = null;
      let maxArea = 0;

      for (const img of allImages) {
        if (isLikelyUseless(img)) continue;
        const area = img.width * img.height;
        if (area > maxArea) {
          maxArea = area;
          largestImg = img;
        }
      }

      return largestImg ? largestImg.src : null;
    });

    await browser.close();

    if (imageUrl) {
      console.log(`[Scraper] Found image via Puppeteer: ${imageUrl}`);
      
      // Update in-memory data
      const product = productsData.find(p => p.id === parseInt(productId));
      if (product) product.urlImage = imageUrl;
      
      return res.json({ success: true, urlImage: imageUrl, source: 'puppeteer' });
    } else {
      throw new Error('Gambar tidak ditemukan oleh Puppeteer');
    }

  } catch (error) {
    console.error(`[Scraper] 💥 All strategies failed for ${url}: ${error.message}`);
    res.status(500).json({ error: 'Gagal mengambil gambar: ' + error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});

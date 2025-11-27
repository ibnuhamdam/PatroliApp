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

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'AIzaSyAY74qf37C81flxSNnEeIQs2CKIK2gUjWo');
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
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const reviewer = req.query.reviewer;

  // const produkData = productsData.slice(startIndex, endIndex);
  const produkData = productsData.filter(r => r.reviewer == reviewer && r.hasilPemeriksaan != '');
  // console.log(reviewer)
  const paginatedProducts = produkData.slice(startIndex, endIndex);
  
  const stats = {
    total: productsData.length,
    reviewed: productsData.filter(p => p.reviewed && p.reviewer === reviewer).length,
    sesuai: productsData.filter(p => p.hasilReview === 'Sesuai' && p.reviewer === reviewer).length,
    tidakSesuai: productsData.filter(p => p.hasilReview === 'Tidak Sesuai' && p.reviewer === reviewer).length,
    cocok: productsData.filter(p => p.hasilReview && p.hasilReview === p.hasilPemeriksaan && p.reviewer === reviewer).length,
    tidakCocok: productsData.filter(p => p.hasilReview && p.hasilReview !== p.hasilPemeriksaan && p.reviewer === reviewer).length
  };

  res.json({
    products: paginatedProducts,
    stats: stats,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(productsData.length / limit),
      totalItems: productsData.length
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
  const stats = {
    total: productsData.length,
    reviewed: productsData.filter(p => p.reviewed && p.reviewer === reviewer).length,
    belumReview: productsData.filter(p => !p.reviewed && p.reviewer === reviewer).length,
    benar: productsData.filter(p => p.hasilReview === 'Benar' && p.reviewer === reviewer).length,
    salah: productsData.filter(p => p.hasilReview === 'Salah' && p.reviewer === reviewer).length
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
    
    if (!productName) {
      return res.status(400).json({ error: 'Nama produk diperlukan' });
    }

    const prompt = `Jelaskan secara singkat apa itu produk "${productName}" dalam 2-3 kalimat. Fokus pada fungsi dan kegunaan produk tersebut dalam konteks perkantoran atau bisnis. Gunakan Bahasa Indonesia yang mudah dipahami.`;
    
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
      message: `Berhasil mengupdate ${result.updatedRows} baris di Google Sheet`
    });

  } catch (error) {
    console.error('Error updating sheet:', error);
    res.status(500).json({ error: 'Gagal mengupdate Google Sheet: ' + error.message });
  }
});

// Endpoint: Scrape Image
app.post('/api/scrape-image', async (req, res) => {
  try {
    const { productId, url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL produk diperlukan' });
    }

    // console.log(`[Scraper] Fetching URL: ${url}`);

    // Fetch HTML with timeout
    // Use a bot user agent to ensure we get the pre-rendered meta tags (SSR)
    const response = await axios.get(url, {
      timeout: 10000, 
      headers: {
        'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
      }
    });
    
    // console.log(`[Scraper] Response received. Status: ${response.status}`);
    
    const html = response.data;
    const $ = cheerio.load(html);
    
    // Select image
    // Priority 1: Open Graph Image (Best for dynamic sites like Next.js/React)
    let imageUrl = $('meta[property="og:image"]').attr('content');
    // if (imageUrl) console.log('[Scraper] Found via og:image');

    // Priority 2: Twitter Image
    if (!imageUrl) {
      imageUrl = $('meta[name="twitter:image"]').attr('content');
      // if (imageUrl) console.log('[Scraper] Found via twitter:image');
    }

    // Priority 3: Specific class requested by user (img tag)
    if (!imageUrl) {
      const stickyImg = $('.sticky-section-image img').attr('src');
      if (stickyImg) {
        imageUrl = stickyImg;
        // console.log('[Scraper] Found via .sticky-section-image img');
      }
    }
    
    // Selector 3: Fallback to first image in main container (generic)
    if (!imageUrl) {
      imageUrl = $('img').first().attr('src');
      if (imageUrl) console.log('[Scraper] Found via first img');
    }

    // Fallback: Regex for Next.js hydration data (if meta tags are missing from DOM)
    if (!imageUrl) {
      // Pattern: property":"og:image","content":"URL"
      const regex = /property\\?":\\?"og:image\\?",\\?"content\\?":\\?"([^\\"]+)\\"/;
      const match = html.match(regex);
      if (match && match[1]) {
        imageUrl = match[1];
        console.log('[Scraper] Found via Regex (Next.js hydration)');
      }
    }

    if (imageUrl) {
      // Handle relative URLs
      if (imageUrl.startsWith('/')) {
        const urlObj = new URL(url);
        imageUrl = `${urlObj.origin}${imageUrl}`;
      } else if (!imageUrl.startsWith('http')) {
        // Handle relative URLs without leading slash (rare but possible)
        const urlObj = new URL(url);
        imageUrl = `${urlObj.origin}/${imageUrl}`;
      }

      // console.log(`[Scraper] ✅ FINAL IMAGE URL for ${url}: ${imageUrl}`);

      // Update in-memory data
      const product = productsData.find(p => p.id === parseInt(productId));
      if (product) {
        product.urlImage = imageUrl;
      }
      
      res.json({ success: true, urlImage: imageUrl });
    } else {
      // console.log(`[Scraper] ❌ No image found for ${url}`);
      // console.log('[Scraper] HTML Preview (first 500 chars):');
      // console.log(html.substring(0, 500)); 
      res.status(404).json({ error: 'Gambar tidak ditemukan' });
    }

  } catch (error) {
    console.error(`[Scraper] 💥 Error scraping image: ${error.message}`);
    if (error.response) {
       console.error(`[Scraper] Response Status: ${error.response.status}`);
    }
    res.status(500).json({ error: 'Gagal mengambil gambar: ' + error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});

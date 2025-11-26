const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || 'AIzaSyAY74qf37C81flxSNnEeIQs2CKIK2gUjWo');
const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

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
    const requiredColumns = ['kategori_lv1', 'kategori_lv2', 'kategori_lv3', 'nama_produk','url_produk','url_image', 'hasil pemeriksa','reviewer', 'pemeriksa'];
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

  const paginatedProducts = productsData.slice(startIndex, endIndex);
  
  const stats = {
    total: productsData.length,
    reviewed: productsData.filter(p => p.reviewed).length,
    sesuai: productsData.filter(p => p.hasilReview === 'Sesuai').length,
    tidakSesuai: productsData.filter(p => p.hasilReview === 'Tidak Sesuai').length,
    cocok: productsData.filter(p => p.hasilReview && p.hasilReview === p.hasilPemeriksaan).length,
    tidakCocok: productsData.filter(p => p.hasilReview && p.hasilReview !== p.hasilPemeriksaan).length
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
  const stats = {
    total: productsData.length,
    reviewed: productsData.filter(p => p.reviewed).length,
    belumReview: productsData.filter(p => !p.reviewed).length,
    benar: productsData.filter(p => p.hasilReview === 'Benar').length,
    salah: productsData.filter(p => p.hasilReview === 'Salah').length
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

app.listen(PORT, () => {
  console.log(`Server berjalan di http://localhost:${PORT}`);
});

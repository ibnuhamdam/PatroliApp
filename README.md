# Aplikasi Patroli Produk

Aplikasi web untuk melakukan patroli dan verifikasi kesesuaian kategori produk. User dapat upload file Excel yang berisi data produk dengan kategori bertingkat, kemudian melakukan verifikasi apakah kategori produk sudah sesuai atau tidak.

## Fitur

- ✅ Upload file Excel (.xlsx atau .xls)
- ✅ Parsing otomatis data produk
- ✅ Interface verifikasi yang modern dan intuitif
- ✅ Statistik real-time (total, terverifikasi, sesuai, tidak sesuai)
- ✅ Progress tracking
- ✅ Download hasil verifikasi dalam format Excel
- ✅ Pagination untuk data besar
- ✅ Drag & drop file upload
- ✅ Responsive design

## Format File Excel

File Excel harus memiliki kolom-kolom berikut:

| Kategori Lv 1 | Kategori Lv 2 | Kategori Lv 3 | Nama Produk | Hasil Pemeriksaan |
|---------------|---------------|---------------|-------------|-------------------|
| Elektronik    | Komputer      | Laptop        | Laptop ASUS | (kosong/Sesuai/Tidak Sesuai) |

**Catatan:**
- Kolom "Hasil Pemeriksaan" bisa kosong atau sudah terisi
- Nilai yang valid: "Sesuai" atau "Tidak Sesuai"

## Instalasi

1. **Clone atau download project ini**

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Jalankan server:**
   ```bash
   npm start
   ```

4. **Buka browser dan akses:**
   ```
   http://localhost:3000
   ```

## Cara Penggunaan

1. **Upload File Excel**
   - Klik tombol "Pilih File Excel" atau drag & drop file Excel ke area upload
   - File akan otomatis diparsing dan data produk akan ditampilkan

2. **Verifikasi Produk**
   - Setiap produk akan ditampilkan dengan detail kategori (Level 1, 2, 3)
   - Klik tombol "✓ Sesuai" jika kategori produk sudah benar
   - Klik tombol "✗ Tidak Sesuai" jika kategori produk salah
   - Status akan langsung terupdate

3. **Monitor Progress**
   - Lihat statistik di bagian atas untuk tracking progress
   - Progress bar menunjukkan persentase produk yang sudah diverifikasi

4. **Download Hasil**
   - Klik tombol "📥 Download Hasil" untuk download file Excel yang sudah terupdate
   - File akan berisi kolom "Hasil Pemeriksaan" yang sudah terisi

5. **Reset Data**
   - Klik tombol "🔄 Reset Data" untuk menghapus semua data dan mulai dari awal

## Teknologi

- **Backend:** Node.js, Express
- **Frontend:** HTML, CSS, Vanilla JavaScript
- **Library:** 
  - `xlsx` - Parsing dan generate Excel
  - `multer` - Upload file
  - `cors` - CORS handling

## Struktur Project

```
uiPatroli/
├── server.js              # Backend server
├── package.json           # Dependencies
├── public/
│   ├── index.html        # HTML utama
│   ├── css/
│   │   └── style.css     # Styling
│   └── js/
│       └── app.js        # JavaScript frontend
└── uploads/              # Folder untuk file upload (auto-generated)
```

## API Endpoints

- `POST /api/upload` - Upload dan parse file Excel
- `GET /api/products` - Get daftar produk (dengan pagination)
- `GET /api/products/:id` - Get detail produk
- `PUT /api/products/:id` - Update hasil pemeriksaan
- `GET /api/stats` - Get statistik verifikasi
- `GET /api/download` - Download hasil verifikasi
- `POST /api/reset` - Reset semua data

## Catatan

- Data disimpan di memory (in-memory), jadi akan hilang jika server direstart
- Untuk production, disarankan menggunakan database (MongoDB, PostgreSQL, dll)
- Port default: 3000 (bisa diubah di `server.js`)

## License

ISC

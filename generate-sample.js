const XLSX = require('xlsx');

// Data contoh produk
const sampleData = [
  {
    'Kategori Lv 1': 'Elektronik',
    'Kategori Lv 2': 'Komputer',
    'Kategori Lv 3': 'Laptop',
    'Nama Produk': 'Laptop ASUS ROG Strix G15',
    'Hasil Pemeriksaan': ''
  },
  {
    'Kategori Lv 1': 'Elektronik',
    'Kategori Lv 2': 'Komputer',
    'Kategori Lv 3': 'Desktop',
    'Nama Produk': 'PC Gaming Custom RGB',
    'Hasil Pemeriksaan': ''
  },
  {
    'Kategori Lv 1': 'Elektronik',
    'Kategori Lv 2': 'Smartphone',
    'Kategori Lv 3': 'Android',
    'Nama Produk': 'Samsung Galaxy S23 Ultra',
    'Hasil Pemeriksaan': ''
  },
  {
    'Kategori Lv 1': 'Elektronik',
    'Kategori Lv 2': 'Smartphone',
    'Kategori Lv 3': 'iPhone',
    'Nama Produk': 'iPhone 15 Pro Max',
    'Hasil Pemeriksaan': ''
  },
  {
    'Kategori Lv 1': 'Elektronik',
    'Kategori Lv 2': 'Audio',
    'Kategori Lv 3': 'Headphone',
    'Nama Produk': 'Sony WH-1000XM5',
    'Hasil Pemeriksaan': ''
  },
  {
    'Kategori Lv 1': 'Fashion',
    'Kategori Lv 2': 'Pakaian',
    'Kategori Lv 3': 'Kaos',
    'Nama Produk': 'Kaos Polos Cotton Combed',
    'Hasil Pemeriksaan': ''
  },
  {
    'Kategori Lv 1': 'Fashion',
    'Kategori Lv 2': 'Pakaian',
    'Kategori Lv 3': 'Kemeja',
    'Nama Produk': 'Kemeja Formal Pria',
    'Hasil Pemeriksaan': ''
  },
  {
    'Kategori Lv 1': 'Fashion',
    'Kategori Lv 2': 'Sepatu',
    'Kategori Lv 3': 'Sneakers',
    'Nama Produk': 'Nike Air Max 270',
    'Hasil Pemeriksaan': ''
  },
  {
    'Kategori Lv 1': 'Fashion',
    'Kategori Lv 2': 'Sepatu',
    'Kategori Lv 3': 'Formal',
    'Nama Produk': 'Sepatu Pantofel Kulit',
    'Hasil Pemeriksaan': ''
  },
  {
    'Kategori Lv 1': 'Rumah Tangga',
    'Kategori Lv 2': 'Peralatan Dapur',
    'Kategori Lv 3': 'Panci',
    'Nama Produk': 'Panci Set Stainless Steel',
    'Hasil Pemeriksaan': ''
  },
  {
    'Kategori Lv 1': 'Rumah Tangga',
    'Kategori Lv 2': 'Peralatan Dapur',
    'Kategori Lv 3': 'Blender',
    'Nama Produk': 'Blender Philips 2 Liter',
    'Hasil Pemeriksaan': ''
  },
  {
    'Kategori Lv 1': 'Rumah Tangga',
    'Kategori Lv 2': 'Furniture',
    'Kategori Lv 3': 'Meja',
    'Nama Produk': 'Meja Belajar Minimalis',
    'Hasil Pemeriksaan': ''
  },
  {
    'Kategori Lv 1': 'Rumah Tangga',
    'Kategori Lv 2': 'Furniture',
    'Kategori Lv 3': 'Kursi',
    'Nama Produk': 'Kursi Gaming RGB',
    'Hasil Pemeriksaan': ''
  },
  {
    'Kategori Lv 1': 'Olahraga',
    'Kategori Lv 2': 'Fitness',
    'Kategori Lv 3': 'Dumbbell',
    'Nama Produk': 'Dumbbell Set 20kg',
    'Hasil Pemeriksaan': ''
  },
  {
    'Kategori Lv 1': 'Olahraga',
    'Kategori Lv 2': 'Fitness',
    'Kategori Lv 3': 'Matras',
    'Nama Produk': 'Matras Yoga Anti Slip',
    'Hasil Pemeriksaan': ''
  },
  {
    'Kategori Lv 1': 'Olahraga',
    'Kategori Lv 2': 'Sepeda',
    'Kategori Lv 3': 'MTB',
    'Nama Produk': 'Sepeda Gunung Polygon',
    'Hasil Pemeriksaan': ''
  },
  {
    'Kategori Lv 1': 'Olahraga',
    'Kategori Lv 2': 'Sepeda',
    'Kategori Lv 3': 'Road Bike',
    'Nama Produk': 'Sepeda Balap Carbon',
    'Hasil Pemeriksaan': ''
  },
  {
    'Kategori Lv 1': 'Makanan',
    'Kategori Lv 2': 'Snack',
    'Kategori Lv 3': 'Keripik',
    'Nama Produk': 'Keripik Kentang Original',
    'Hasil Pemeriksaan': ''
  },
  {
    'Kategori Lv 1': 'Makanan',
    'Kategori Lv 2': 'Snack',
    'Kategori Lv 3': 'Coklat',
    'Nama Produk': 'Coklat Silverqueen',
    'Hasil Pemeriksaan': ''
  },
  {
    'Kategori Lv 1': 'Makanan',
    'Kategori Lv 2': 'Minuman',
    'Kategori Lv 3': 'Kopi',
    'Nama Produk': 'Kopi Arabica Premium',
    'Hasil Pemeriksaan': ''
  }
];

// Buat workbook
const worksheet = XLSX.utils.json_to_sheet(sampleData);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, 'Data Produk');

// Simpan file
XLSX.writeFile(workbook, 'sample-data-produk.xlsx');

console.log('✅ File sample-data-produk.xlsx berhasil dibuat!');
console.log(`📊 Total produk: ${sampleData.length}`);

const scrapperImageService = require('./services/ScrapperImage-debug');

// Test URL dari katalog.inaproc.id
const testUrl = 'https://katalog.inaproc.id/cipta-sentra-mandiri/motor-honda-beat-street';

console.log('🔍 Testing ScrapperImage Service (DEBUG MODE)...');
console.log(`📍 URL: ${testUrl}\n`);

(async () => {
  try {
    const imageUrls = await scrapperImageService.scrapeProductImages(testUrl);
    
    console.log(`\n✅ Berhasil! Ditemukan ${imageUrls.length} gambar:\n`);
    
    imageUrls.forEach((url, index) => {
      const marker = index === 3 ? '👉 [SELECTED - INDEX 3]' : '';
      console.log(`${index + 1}. ${url} ${marker}`);
    });
    
    console.log('\n📊 Hasil:');
    console.log(`   Total gambar: ${imageUrls.length}`);
    console.log(`   Gambar terpilih (index 3): ${imageUrls[3] || imageUrls[imageUrls.length - 1]}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
})();

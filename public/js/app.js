// Load Products
const API_URL = `${window.location.origin}/api`;

// Global State
let selectedReviewer = '';
let currentUnreviewedPage = 1;
let currentReviewedPage = 1;
const itemsPerPage = 10;
let totalUnreviewedPages = 1;
let totalReviewedPages = 1;
let currentMode = 'excel'; // 'excel' or 'sheets'
let searchQuery = '';

async function loadProducts() {
  const reviewerName = selectedReviewer || '';
  const selectedCategory = document.getElementById('categoryFilter') ? document.getElementById('categoryFilter').value : '';


  

  try {
    const params = new URLSearchParams({
      pageUnreviewed: currentUnreviewedPage,
      limitUnreviewed: itemsPerPage,
      pageReviewed: currentReviewedPage,
      limitReviewed: itemsPerPage,
      reviewer: reviewerName,
      search: searchQuery,
      category: selectedCategory
    });

    const response = await fetch(`${API_URL}/products?${params.toString()}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error('Gagal memuat produk');
    }

    // Update pagination info
    totalUnreviewedPages = data.pagination.unreviewed.totalPages;
    totalReviewedPages = data.pagination.reviewed.totalPages;
    
    updatePaginationUI(data.pagination);

    // Render products
    renderProducts(data.unreviewed, data.reviewed);

  } catch (error) {
    showNotification(error.message, 'error');
  }
}

// Update Pagination UI
function updatePaginationUI(pagination) {
  // Unreviewed Pagination
  document.getElementById('pageInfoUnreviewed').textContent = `Hal ${pagination.unreviewed.currentPage} dari ${pagination.unreviewed.totalPages}`;
  document.getElementById('prevBtnUnreviewed').disabled = pagination.unreviewed.currentPage === 1;
  document.getElementById('nextBtnUnreviewed').disabled = pagination.unreviewed.currentPage === pagination.unreviewed.totalPages;

  // Reviewed Pagination
  document.getElementById('pageInfoReviewed').textContent = `Hal ${pagination.reviewed.currentPage} dari ${pagination.reviewed.totalPages}`;
  document.getElementById('prevBtnReviewed').disabled = pagination.reviewed.currentPage === 1;
  document.getElementById('nextBtnReviewed').disabled = pagination.reviewed.currentPage === pagination.reviewed.totalPages;
}

// Setup Event Listeners (removed Excel upload handlers)





// Render Products
function renderProducts(unreviewedProducts, reviewedProducts) {
  const unreviewedGrid = document.getElementById('unreviewedGrid');
  const reviewedGrid = document.getElementById('reviewedGrid');
  
  // Render Unreviewed
  if (!unreviewedProducts || unreviewedProducts.length === 0) {
    unreviewedGrid.innerHTML = `
      <div class="empty-state" style="padding: 2rem;">
        <div class="empty-state-icon" style="font-size: 2rem;">🎉</div>
        <h3 style="font-size: 1.2rem;">Semua Selesai!</h3>
        <p style="font-size: 0.9rem;">Tidak ada produk yang perlu direview.</p>
      </div>
    `;
  } else {
    unreviewedGrid.innerHTML = unreviewedProducts.map(product => createProductCard(product)).join('');
  }

  // Render Reviewed
  if (!reviewedProducts || reviewedProducts.length === 0) {
    reviewedGrid.innerHTML = `
      <div class="empty-state" style="padding: 2rem;">
        <div class="empty-state-icon" style="font-size: 2rem;">📝</div>
        <h3 style="font-size: 1.2rem;">Belum Ada Review</h3>
        <p style="font-size: 0.9rem;">Produk yang sudah direview akan muncul di sini.</p>
      </div>
    `;
  } else {
    reviewedGrid.innerHTML = reviewedProducts.map(product => createProductCard(product)).join('');
  }


}

function createProductCard(product) {
  return `
    <div class="product-card ${product.reviewed ? 'reviewed' : ''}" data-id="${product.id}">
      <div class="product-header">
        <span class="product-id">#${product.id}</span>
        <span class="product-status ${getReviewStatusClass(product.hasilReview)}">
          ${getReviewStatusText(product.hasilReview)}
        </span>
      </div>
      
      <div class="product-categories">
        <div class="category-item">
          <span class="category-label">Kategori Lv 1:</span>
          <span>${escapeHtml(product.kategoriLv1)}</span>
        </div>
        <div class="category-item">
          <span class="category-label">Kategori Lv 2:</span>
          <span>${escapeHtml(product.kategoriLv2)}</span>
        </div>
        <div class="category-item">
          <span class="category-label">Kategori Lv 3:</span>
          <span class="category-lv3">${escapeHtml(product.kategoriLv3)}</span>
        </div>
      </div>

      <a href="${escapeHtml(product.urlProduk)}" target="_blank">
        <h3 class="product-name">${escapeHtml(product.namaProduk)}</h3>
      </a>
      
      <div class="product-image" id="img-container-${product.id}">
        ${product.urlImage ? 
          `<img src="${escapeHtml(product.urlImage.trim())}" alt="${escapeHtml(product.namaProduk)}" referrerpolicy="no-referrer" loading="lazy" onerror="this.onerror=null; this.src='https://via.placeholder.com/150?text=No+Image'">` :
           `<div class="no-image">
             <p>Gambar tidak tersedia</p>
           </div>`
        }
      </div>
      


      <button class="btn-ai" onclick="explainProduct('${escapeHtml(product.namaProduk)}', '${escapeHtml(product.kategoriLv3)}', ${product.id})">
        🤖 Tanya AI tentang produk ini
      </button>
      
      <div class="product-info">
        <div class="info-row">
          <span class="info-label">📋 Hasil Pemeriksaan:</span>
          <span class="info-value ${getStatusBadgeClass(product.hasilPemeriksaan)}">
            ${product.hasilPemeriksaan ? escapeHtml(product.hasilPemeriksaan) : '<span class="text-muted">Kosong</span>'}
          </span>
        </div>
        <div class="info-row">
          <span class="info-label">👤 Pemeriksa:</span>
          <span class="info-value">${escapeHtml(product.pemeriksa)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">👤 Reviewer:</span>
          <span class="info-value">${escapeHtml(product.reviewer)}</span>
        </div>
        ${product.hasilReview ? `
        <div class="info-row">
          <span class="info-label">✓ Hasil Review:</span>
          <span class="info-value ${getStatusBadgeClass(product.hasilReview)}">
            ${escapeHtml(product.hasilReview)}
          </span>
        </div>
        ` : ''}
      </div>

      <div class="product-actions">
        <button class="btn btn-success" onclick="reviewProduct(${product.id}, 'Benar')">
          ✓ Benar
        </button>
        <button class="btn btn-danger" onclick="reviewProduct(${product.id}, 'Salah')">
          ✗ Salah
        </button>
      </div>
    </div>
  `;
}

// Review Product
async function reviewProduct(productId, hasil_review) {
  try {
    const response = await fetch(`${API_URL}/products/${productId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ hasilReview: hasil_review })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Gagal mereview produk');
    }

    // Show success
    showNotification(`Review berhasil: "${hasil_review}"`, 'success');

    // Reload data
    await loadProducts();
    await loadStats();

  } catch (error) {
    showNotification(error.message, 'error');
  }
}

// Load Statistics
async function loadStats() {
  const reviewerName = selectedReviewer || '';

  try {
    const response = await fetch(`${API_URL}/stats?reviewer=${reviewerName}`);
    const stats = await response.json();

    if (!response.ok) {
      throw new Error('Gagal memuat statistik');
    }

    // Update stats
    document.getElementById('statTotal').textContent = stats.total;
    document.getElementById('statReviewed').textContent = stats.reviewed;
    document.getElementById('statBenar').textContent = stats.benar;
    document.getElementById('statSalah').textContent = stats.salah;

    // Update progress bar
    const progress = stats.total > 0 ? (stats.reviewed / stats.total) * 100 : 0;
    document.getElementById('progressFill').style.width = `${progress}%`;

  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

async function loadCategories() {
  const reviewerName = selectedReviewer || '';
  const categoryFilter = document.getElementById('categoryFilter');

  try {
    const response = await fetch(`${API_URL}/categories`);
    const category = await response.json();
    // console.log(category);

    if (!response.ok) {
      throw new Error('Gagal memuat Category');
    }

    categoryFilter.innerHTML = `<option value="">Semua Kategori</option>
    ${category.map(cat => `<option value="${cat}">${cat}</option>`).join('')}`;

  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

// Download Results
async function downloadResults() {
  try {
    const response = await fetch(`${API_URL}/download`);
    
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Gagal mendownload file');
    }

    // Get blob
    const blob = await response.blob();
    
    // Create download link
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hasil-patroli-${Date.now()}.xlsx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    showNotification('File berhasil didownload!', 'success');

  } catch (error) {
    showNotification(error.message, 'error');
  }
}

// Reset Data
async function resetData() {
  if (!confirm('Apakah Anda yakin ingin mereset semua data?')) {
    return;
  }

  try {
    const response = await fetch(`${API_URL}/reset`, {
      method: 'POST'
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Gagal mereset data');
    }

    // Reset sheet input
    document.getElementById('sheetIdInput').value = '';
    
    // Reset UI - show sheets section again
    document.getElementById('sheetsSection').classList.remove('hidden');
    document.getElementById('statsSection').classList.add('hidden');
    document.getElementById('productsSection').classList.add('hidden');
    document.getElementById('uploadStatus').classList.add('hidden');
    document.getElementById('uploadStatus').textContent = '';
    
    // Reset buttons
    document.getElementById('btnUpdateSheets').classList.add('hidden');
    document.getElementById('btnDownload').classList.remove('hidden');

    showNotification('Data berhasil direset', 'success');
  } catch (error) {
    showNotification(error.message, 'error');
  }
}





// Update Google Sheets
async function updateSheets() {
  const sheetIdInput = document.getElementById('sheetIdInput');
  let spreadsheetId = sheetIdInput.value.trim();
  
  // Extract ID if URL is provided
  const match = spreadsheetId.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match) {
    spreadsheetId = match[1];
  }

  if (!spreadsheetId) {
    showNotification('ID Spreadsheet hilang, silakan muat ulang', 'error');
    return;
  }

  const btnUpdate = document.getElementById('btnUpdateSheets');
  const originalText = btnUpdate.innerHTML;
  btnUpdate.disabled = true;
  btnUpdate.innerHTML = '⏳ Mengupdate...';

  try {
    const response = await fetch(`${API_URL}/sheets/update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ spreadsheetId })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Gagal mengupdate sheet');
    }

    showNotification(data.message, 'success');

  } catch (error) {
    console.error('Error:', error);
    showNotification(error.message, 'error');
  } finally {
    btnUpdate.disabled = false;
    btnUpdate.innerHTML = originalText;
  }
}


// Helper Functions
function getReviewStatusClass(hasil_review) {
  if (!hasil_review) return 'status-belum';
  if (hasil_review === 'Benar') return 'status-sesuai';
  if (hasil_review === 'Salah') return 'status-tidak-sesuai';
  return 'status-belum';
}

function getReviewStatusText(hasil_review) {
  if (!hasil_review) return 'Belum Review';
  return 'Review: ' + hasil_review;
}

function getStatusBadgeClass(status) {
  if (status === 'Sesuai' || status === 'Benar') return 'badge-sesuai';
  if (status === 'Tidak Sesuai' || status === 'Salah') return 'badge-tidak-sesuai';
  return '';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showNotification(message, type = 'success') {
  // Remove existing notifications
  const existing = document.querySelectorAll('.notification');
  existing.forEach(n => n.remove());

  // Create notification
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.innerHTML = `
    <div style="font-weight: 600; margin-bottom: 0.25rem;">
      ${type === 'success' ? '✓ Berhasil' : '✗ Error'}
    </div>
    <div style="color: var(--text-secondary);">${message}</div>
  `;

  document.body.appendChild(notification);

  // Auto remove after 4 seconds
  setTimeout(() => {
    notification.style.animation = 'slideInRight 0.3s ease reverse';
    setTimeout(() => notification.remove(), 300);
  }, 4000);
}

// AI Product Explanation
async function explainProduct(productName, categoryName, productId) {
  try {
    // Show loading modal
    showAIModal(productName, 'loading');
    
    const response = await fetch(`${API_URL}/ai/explain-product`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ productName, categoryName })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Gagal mendapatkan penjelasan');
    }

    // Show result
    showAIModal(productName, 'success', data.explanation);

  } catch (error) {
    showAIModal(productName, 'error', error.message);
  }
}

function showAIModal(productName, status, content = '') {
  // Remove existing modal
  const existingModal = document.getElementById('aiModal');
  if (existingModal) {
    existingModal.remove();
  }

  // Create modal
  const modal = document.createElement('div');
  modal.id = 'aiModal';
  modal.className = 'ai-modal';
  
  let modalContent = '';
  
  if (status === 'loading') {
    modalContent = `
      <div class="ai-modal-content">
        <div class="ai-modal-header">
          <h3>🤖 AI sedang berpikir...</h3>
          <button class="ai-modal-close" onclick="closeAIModal()">✕</button>
        </div>
        <div class="ai-modal-body">
          <div class="ai-loading">
            <div class="loading"></div>
            <p>Menganalisis produk "${escapeHtml(productName)}"...</p>
          </div>
        </div>
      </div>
    `;
  } else if (status === 'success') {
    modalContent = `
      <div class="ai-modal-content">
        <div class="ai-modal-header">
          <h3>🤖 Penjelasan AI: ${escapeHtml(productName)}</h3>
          <button class="ai-modal-close" onclick="closeAIModal()">✕</button>
        </div>
        <div class="ai-modal-body">
          <div class="ai-explanation">
            ${escapeHtml(content)}
          </div>
        </div>
        <div class="ai-modal-footer">
          <button class="btn btn-primary" onclick="closeAIModal()">Tutup</button>
        </div>
      </div>
    `;
  } else {
    modalContent = `
      <div class="ai-modal-content">
        <div class="ai-modal-header">
          <h3>❌ Error</h3>
          <button class="ai-modal-close" onclick="closeAIModal()">✕</button>
        </div>
        <div class="ai-modal-body">
          <p style="color: var(--text-secondary);">${escapeHtml(content)}</p>
        </div>
        <div class="ai-modal-footer">
          <button class="btn btn-danger" onclick="closeAIModal()">Tutup</button>
        </div>
      </div>
    `;
  }
  
  modal.innerHTML = modalContent;
  document.body.appendChild(modal);
  
  // Close on background click
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeAIModal();
    }
  });
}

function closeAIModal() {
  const modal = document.getElementById('aiModal');
  if (modal) {
    modal.style.animation = 'fadeOut 0.3s ease';
    setTimeout(() => modal.remove(), 300);
  }
}



// Character Selection Functions


// Character image pools
const characterImages = {
  cowo: [
    '/assets/character/cowo/character_cowo_professional.png',
    '/assets/character/cowo/Character_cowo_pintar.png',
    '/assets/character/cowo/character_cowo_explore.png',
    '/assets/character/cowo/character_cowo_street.png'
  ],
  cewe: [
    '/assets/character/cewe/character_cewe_fashion.png',
    '/assets/character/cewe/character_cewe_kopi.png'
  ]
};

// Get random image based on gender
function getRandomCharacterImage(gender) {
  const images = characterImages[gender];
  return images[Math.floor(Math.random() * images.length)];
}

function openCharacterModal() {
  const modal = document.getElementById('characterModal');
  modal.classList.add('active');
}

function closeCharacterModal() {
  const modal = document.getElementById('characterModal');
  modal.classList.remove('active');
}

function selectCharacter(name, gender) {
  selectedReviewer = name;
  
  // Get random image for this gender
  const randomImage = getRandomCharacterImage(gender);
  
  // Update button display
  const avatarSmall = document.querySelector('.character-avatar-small');
  const nameDisplay = document.getElementById('selectedCharacterName');
  
  // Update with image instead of emoji
  avatarSmall.innerHTML = `<img src="${randomImage}" alt="${name}">`;
  nameDisplay.textContent = name;
  
  // Close modal
  closeCharacterModal();
  
  // Show notification
  showNotification(`Karakter ${name} dipilih!`, 'success');
}

// Update loadFromSheets to use selectedReviewer
async function loadFromSheets() {
  const sheetIdInput = document.getElementById('sheetIdInput');
  const spreadsheetIdOrUrl = sheetIdInput.value.trim();
  const reviewerName = selectedReviewer; // Use selected character instead of dropdown
  
  // Validate reviewer selection
  if (!reviewerName) {
    showNotification('Silakan pilih karakter terlebih dahulu', 'error');
    return;
  }

  if (!spreadsheetIdOrUrl) {
    showNotification('Silakan masukkan ID atau URL Spreadsheet', 'error');
    return;
  }

  // Extract ID if URL is provided
  let spreadsheetId = spreadsheetIdOrUrl;
  const match = spreadsheetIdOrUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match) {
    spreadsheetId = match[1];
  }

  const statusDiv = document.getElementById('uploadStatus');
  statusDiv.textContent = `Memuat data untuk reviewer: ${reviewerName}...`;
  statusDiv.className = 'mt-2 text-center text-info';
  statusDiv.classList.remove('hidden');

  try {
    const response = await fetch(`${API_URL}/sheets/read`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ spreadsheetId, reviewerName })
    });

    const data = await response.json();

    // console.log(data);

    if (!response.ok) {
      throw new Error(data.error || 'Gagal memuat data');
    }

    // Update UI
    // document.getElementById('uploadArea').classList.add('hidden'); // Removed
    document.getElementById('sheetsSection').classList.add('hidden'); // Hide sheets input
    document.getElementById('statsSection').classList.remove('hidden');
    document.getElementById('productsSection').classList.remove('hidden');
    
    // Show Update Button, Hide Download
    document.getElementById('btnUpdateSheets').classList.remove('hidden');
    document.getElementById('btnDownload').classList.add('hidden');

    statusDiv.textContent = data.message;
    statusDiv.className = 'mt-2 text-center text-success';

    // Load products and stats
    await loadProducts();
    await loadStats();
    await loadCategories(); // Load categories for filter

  } catch (error) {
    console.error('Error:', error);
    statusDiv.textContent = error.message;
    statusDiv.className = 'mt-2 text-center text-danger';
  }
}

// Setup Event Listeners
function setupEventListeners() {
}

// Close modal when clicking outside
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('characterModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeCharacterModal();
      }
    });
  }
});

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  
  // Add enter key listener for search
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        searchProducts();
      }
    });
  }
});

// ... (setupEventListeners remains same) ...

// Search Products
function searchProducts() {
  const searchInput = document.getElementById('searchInput');
  searchQuery = searchInput.value.trim();
  
  // Reset pages to 1 when searching
  currentUnreviewedPage = 1;
  currentReviewedPage = 1;
  
  loadProducts();
}

// Change Unreviewed Page
function filterByCategory() {
  const categoryFilter = document.getElementById('categoryFilter');
  const selectedCategory = categoryFilter.value;
  
  // Reset pages to 1 when filtering
  currentUnreviewedPage = 1;
  currentReviewedPage = 1;
  
  loadProducts();
}

// Change Unreviewed Page
function changeUnreviewedPage(delta) {
  const newPage = currentUnreviewedPage + delta;
  if (newPage >= 1 && newPage <= totalUnreviewedPages) {
    currentUnreviewedPage = newPage;
    loadProducts();
  }
}

// Change Reviewed Page
function changeReviewedPage(delta) {
  const newPage = currentReviewedPage + delta;
  if (newPage >= 1 && newPage <= totalReviewedPages) {
    currentReviewedPage = newPage;
    loadProducts();
  }
}



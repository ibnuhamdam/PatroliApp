// State Management
let currentPage = 1;
const itemsPerPage = 10;
let totalPages = 1;

// API Base URL - works on both localhost and production
const API_URL = `${window.location.origin}/api`;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
});

// Setup Event Listeners
function setupEventListeners() {
  const fileInput = document.getElementById('fileInput');
  const uploadArea = document.getElementById('uploadArea');

  // File input change
  fileInput.addEventListener('change', handleFileSelect);

  // Drag and drop
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
  });

  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
  });

  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      fileInput.files = files;
      handleFileSelect({ target: { files } });
    }
  });
}

// Handle File Selection
async function handleFileSelect(event) {
  const file = event.target.files[0];
  
  if (!file) return;

  // Validate file type
  const validTypes = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel'
  ];
  
  if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls)$/)) {
    showNotification('Hanya file Excel (.xlsx atau .xls) yang diperbolehkan!', 'error');
    return;
  }

  // Show loading
  const uploadStatus = document.getElementById('uploadStatus');
  uploadStatus.className = 'mt-2 text-center';
  uploadStatus.innerHTML = '<div class="loading"></div> <span style="margin-left: 10px;">Mengupload dan memproses file...</span>';

  // Upload file
  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch(`${API_URL}/upload`, {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Gagal mengupload file');
    }

    // Success
    uploadStatus.innerHTML = `✅ ${data.message}`;
    showNotification(`Berhasil memuat ${data.totalProducts} produk!`, 'success');

    // Load products
    await loadProducts();
    await loadStats();

    // Show sections
    document.getElementById('statsSection').classList.remove('hidden');
    document.getElementById('productsSection').classList.remove('hidden');
    document.getElementById('emptyState').classList.add('hidden');

  } catch (error) {
    uploadStatus.innerHTML = `❌ ${error.message}`;
    showNotification(error.message, 'error');
  }
}

// Load Products
async function loadProducts() {
  try {
    const response = await fetch(`${API_URL}/products?page=${currentPage}&limit=${itemsPerPage}`);
    const data = await response.json();

    // console.log(data)

    if (!response.ok) {
      throw new Error('Gagal memuat produk');
    }

    // Update pagination info
    totalPages = data.pagination.totalPages;
    updatePaginationUI();

    // Render products
    renderProducts(data.products);

  } catch (error) {
    showNotification(error.message, 'error');
  }
}

// Render Products
function renderProducts(products) {
  const grid = document.getElementById('productsGrid');
  
  if (products.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📦</div>
        <h3>Tidak Ada Produk</h3>
        <p>Tidak ada produk untuk ditampilkan</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = products.map(product => `
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
      
      <div class="product-image">
        <img src="${escapeHtml(product.urlImage.trim())}" alt="${escapeHtml(product.namaProduk)}" referrerpolicy="no-referrer" loading="lazy" onerror="this.onerror=null; this.src='https://via.placeholder.com/150?text=No+Image'">
      </div>

      <button class="btn-ai" onclick="explainProduct('${escapeHtml(product.namaProduk)}', ${product.id})">
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
  `).join('');
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
  try {
    const response = await fetch(`${API_URL}/stats`);
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

    // Reset UI
    document.getElementById('statsSection').classList.add('hidden');
    document.getElementById('productsSection').classList.add('hidden');
    document.getElementById('emptyState').classList.remove('hidden');
    document.getElementById('uploadStatus').innerHTML = '';
    document.getElementById('fileInput').value = '';

    currentPage = 1;
    
    showNotification('Data berhasil direset!', 'success');

  } catch (error) {
    showNotification(error.message, 'error');
  }
}

// Pagination
function changePage(direction) {
  const newPage = currentPage + direction;
  
  if (newPage < 1 || newPage > totalPages) {
    return;
  }
  
  currentPage = newPage;
  loadProducts();
  
  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updatePaginationUI() {
  document.getElementById('pageInfo').textContent = `Halaman ${currentPage} dari ${totalPages}`;
  document.getElementById('prevBtn').disabled = currentPage === 1;
  document.getElementById('nextBtn').disabled = currentPage === totalPages;
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
async function explainProduct(productName, productId) {
  try {
    // Show loading modal
    showAIModal(productName, 'loading');
    
    const response = await fetch(`${API_URL}/ai/explain-product`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ productName })
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

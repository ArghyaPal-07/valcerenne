// KICKSZN Shop Catalog Controller

let currentFilters = {
  category: '',
  search: '',
  min_price: '',
  max_price: '',
  sort: 'featured',
  page: 1,
  limit: 12
};

let currentView = 'grid';
let categoriesData = [];

const CATEGORY_ICONS = {
  '': '🔥',
  'all': '🔥',
  'gadgets': '⚡',
  'electronics': '⚡',
  'mens-fashion': '👕',
  'womens-fashion': '👗',
  'footwear': '👟',
  'sneakers': '👟',
  'home-living': '🏠',
  'accessories': '⌚',
  'sports-fitness': '🏋️'
};

document.addEventListener('DOMContentLoaded', async () => {
  await State.init();

  // Read URL query params on load
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('category')) currentFilters.category = urlParams.get('category');
  if (urlParams.get('search')) currentFilters.search = urlParams.get('search');
  if (urlParams.get('sort')) currentFilters.sort = urlParams.get('sort');
  if (urlParams.get('page')) currentFilters.page = parseInt(urlParams.get('page'), 10);

  // Sync sort dropdown and search input
  const sortSelect = document.getElementById('shop-sort-select');
  if (sortSelect) {
    sortSelect.value = currentFilters.sort;
    sortSelect.addEventListener('change', (e) => {
      currentFilters.sort = e.target.value;
      currentFilters.page = 1;
      loadShopProducts();
    });
  }

  const searchInput = document.getElementById('shop-search-input');
  if (searchInput) {
    searchInput.value = currentFilters.search;
    let debounceTimer;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        currentFilters.search = e.target.value;
        currentFilters.page = 1;
        loadShopProducts();
      }, 350);
    });
  }

  // Price filter button
  const applyPriceBtn = document.getElementById('apply-price-filter');
  if (applyPriceBtn) {
    applyPriceBtn.addEventListener('click', () => {
      const minVal = document.getElementById('min-price-input').value;
      const maxVal = document.getElementById('max-price-input').value;
      currentFilters.min_price = minVal;
      currentFilters.max_price = maxVal;
      currentFilters.page = 1;
      loadShopProducts();
    });
  }

  // View switchers
  const gridBtn = document.getElementById('view-grid-btn');
  const listBtn = document.getElementById('view-list-btn');
  if (gridBtn && listBtn) {
    gridBtn.addEventListener('click', () => setView('grid'));
    listBtn.addEventListener('click', () => setView('list'));
  }

  await loadCategoriesFilter();
  await loadShopProducts();

  State.subscribe(() => {
    // Re-render to update wishlist heart icons
    renderProductsList(window.lastLoadedProducts || []);
  });
});

function setView(view) {
  currentView = view;
  const grid = document.getElementById('shop-products-grid');
  const gridBtn = document.getElementById('view-grid-btn');
  const listBtn = document.getElementById('view-list-btn');

  if (view === 'list') {
    grid.classList.add('list-view');
    listBtn.classList.add('active');
    gridBtn.classList.remove('active');
  } else {
    grid.classList.remove('list-view');
    gridBtn.classList.add('active');
    listBtn.classList.remove('active');
  }
}

async function loadCategoriesFilter() {
  const sidebarList = document.getElementById('category-filter-list');
  const pillsBar = document.getElementById('shop-category-pills');

  try {
    const res = await api.getCategories();
    if (res.success && res.data.length > 0) {
      categoriesData = res.data;
      const totalCount = categoriesData.reduce((acc, c) => acc + (c.product_count || 0), 0);

      // Render Top Category Pills
      if (pillsBar) {
        let pillsHtml = `
          <button type="button" class="category-pill ${!currentFilters.category ? 'active' : ''}" onclick="filterCategory('', this)">
            
            <span>All pieces</span>
            <span class="pill-badge">${totalCount}</span>
          </button>
        `;

        pillsHtml += categoriesData.map(cat => {
          const icon = CATEGORY_ICONS[cat.slug] || '✨';
          const isActive = currentFilters.category === cat.slug || currentFilters.category === String(cat.id);
          return `
            <button type="button" class="category-pill ${isActive ? 'active' : ''}" onclick="filterCategory('${cat.slug}', this)">
              
              <span>${cat.name}</span>
              <span class="pill-badge">${cat.product_count}</span>
            </button>
          `;
        }).join('');

        pillsBar.innerHTML = pillsHtml;
      }

      // Render Sidebar Category Filter
      if (sidebarList) {
        let sideHtml = `
          <li role="button" tabindex="0" class="filter-item ${!currentFilters.category ? 'active' : ''}" onclick="filterCategory('', this)">
            <span>All pieces</span>
            <span class="count">${totalCount}</span>
          </li>
        `;

        sideHtml += categoriesData.map(cat => {
          const icon = CATEGORY_ICONS[cat.slug] || '✨';
          const isActive = currentFilters.category === cat.slug || currentFilters.category === String(cat.id);
          return `
            <li role="button" tabindex="0" class="filter-item ${isActive ? 'active' : ''}" onclick="filterCategory('${cat.slug}', this)">
              <span>${cat.name}</span>
              <span class="count">${cat.product_count}</span>
            </li>
          `;
        }).join('');

        sidebarList.innerHTML = sideHtml;
      }
    }
  } catch (err) {
    console.error('Failed to load categories filter:', err);
  }
}

function updateCategoryBanner() {
  const banner = document.getElementById('category-drop-banner');
  const bannerTitle = document.getElementById('drop-banner-title');
  const bannerDesc = document.getElementById('drop-banner-desc');
  const bannerCount = document.getElementById('drop-banner-count');

  if (!banner) return;

  if (!currentFilters.category) {
    banner.style.display = 'none';
    return;
  }

  const selectedCat = categoriesData.find(c => c.slug === currentFilters.category || String(c.id) === currentFilters.category);
  if (selectedCat) {
    banner.style.display = 'flex';
    const icon = CATEGORY_ICONS[selectedCat.slug] || '⚡';
    if (bannerTitle) bannerTitle.textContent = `${selectedCat.name}`;
    if (bannerDesc) bannerDesc.textContent = selectedCat.description || 'Discover the considered collection.';
    if (bannerCount) {
      bannerCount.innerHTML = `
        <div style="font-size: 1.5rem; font-weight: 800; color: #a855f7;">${selectedCat.product_count} pieces</div>
        <div style="font-size: 0.75rem; color: #cbd5e1; text-transform: uppercase;">Available Now</div>
      `;
    }
  } else {
    banner.style.display = 'none';
  }
}

function filterCategory(slug, element) {
  currentFilters.category = slug;
  currentFilters.page = 1;

  // Sync all category buttons and list items
  document.querySelectorAll('.category-pill').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('#category-filter-list .filter-item').forEach(el => el.classList.remove('active'));

  document.querySelectorAll(`.category-pill`).forEach(el => {
    if ((!slug && el.textContent.includes('All pieces')) || (slug && el.getAttribute('onclick')?.includes(`'${slug}'`))) {
      el.classList.add('active');
    }
  });

  document.querySelectorAll(`#category-filter-list .filter-item`).forEach(el => {
    if ((!slug && el.textContent.includes('All pieces')) || (slug && el.getAttribute('onclick')?.includes(`'${slug}'`))) {
      el.classList.add('active');
    }
  });

  // Update URL without full refresh
  const url = new URL(window.location);
  if (slug) url.searchParams.set('category', slug);
  else url.searchParams.delete('category');
  window.history.pushState({}, '', url);

  updateCategoryBanner();
  loadShopProducts();
}

function resetFilters() {
  currentFilters = {
    category: '',
    search: '',
    min_price: '',
    max_price: '',
    sort: 'featured',
    page: 1,
    limit: 12
  };

  const minInput = document.getElementById('min-price-input');
  const maxInput = document.getElementById('max-price-input');
  const searchInput = document.getElementById('shop-search-input');
  const sortSelect = document.getElementById('shop-sort-select');

  if (minInput) minInput.value = '';
  if (maxInput) maxInput.value = '';
  if (searchInput) searchInput.value = '';
  if (sortSelect) sortSelect.value = 'featured';

  document.querySelectorAll('.category-pill').forEach(el => el.classList.remove('active'));
  const firstPill = document.querySelector('.category-pill');
  if (firstPill) firstPill.classList.add('active');

  document.querySelectorAll('#category-filter-list .filter-item').forEach(el => el.classList.remove('active'));
  const firstCat = document.querySelector('#category-filter-list .filter-item');
  if (firstCat) firstCat.classList.add('active');

  updateCategoryBanner();
  loadShopProducts();
}

async function loadShopProducts() {
  const grid = document.getElementById('shop-products-grid');
  const resultCount = document.getElementById('shop-result-count');
  const pagination = document.getElementById('shop-pagination');

  if (grid) grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 4rem 0;"><i class="fa-solid fa-spinner fa-spin" style="font-size: 2.5rem; color: var(--primary);"></i><p style="margin-top: 1rem; color: var(--text-muted);">Loading collection...</p></div>`;

  try {
    const res = await api.getProducts(currentFilters);
    if (!res.success) throw new Error(res.message);

    window.lastLoadedProducts = res.data;

    // Result Count
    if (resultCount) {
      const start = (res.pagination.page - 1) * res.pagination.limit + 1;
      const end = Math.min(res.pagination.total, res.pagination.page * res.pagination.limit);
      resultCount.innerHTML = `Showing <strong>${res.pagination.total > 0 ? start : 0}–${end}</strong> of <strong>${res.pagination.total}</strong> products`;
    }

    updateCategoryBanner();
    renderProductsList(res.data);
    renderPagination(res.pagination);

  } catch (err) {
    if (grid) grid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 4rem 0; color: var(--danger);"><i class="fa-solid fa-triangle-exclamation" style="font-size: 2.5rem;"></i><p style="margin-top: 1rem;">Failed to load products: ${err.message}</p></div>`;
  }
}

function getSafeFallbackImage() { return '/assets/image-unavailable.svg'; }

function renderProductsList(products) {
  const grid = document.getElementById('shop-products-grid');
  if (!grid) return;

  if (!products || products.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 5rem 0; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-color);">
        <i class="fa-solid fa-magnifying-glass" style="font-size: 3rem; color: var(--text-light); margin-bottom: 1rem;"></i>
        <h3 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 0.5rem;">No pieces match your criteria</h3>
        <p style="color: var(--text-muted); margin-bottom: 1.5rem;">Try adjusting your category filter, price range, or search keywords.</p>
        <button class="btn btn-outline-primary" onclick="resetFilters()">Reset All Filters</button>
      </div>
    `;
    return;
  }

  grid.innerHTML = products.map(p => {
    const inWishlist = State.wishlist && State.wishlist.some(w => w.id === p.id || w.product_id === p.id);
    const fallback = getSafeFallbackImage(p.category_name);

    return `
      <div class="product-card">
        <div class="product-thumb">
          <a class="product-image-link" href="/product.html?id=${p.slug}" aria-label="View ${escapeHTML(p.title)}"><img src="${p.primary_image || fallback}" alt="${p.title}" loading="lazy" onerror="this.onerror=null; this.src='/assets/image-unavailable.svg';"></a>
          <div class="product-badges">
            ${p.is_new ? '<span class="badge badge-success">New</span>' : ''}
            ${p.compare_price && p.compare_price > p.price ? `<span class="badge badge-danger">-${Math.round((1 - p.price / p.compare_price) * 100)}%</span>` : ''}
          </div>
          <div class="product-actions" style="opacity: 1; transform: none;">
            <button class="product-action-btn ${inWishlist ? 'active' : ''}" onclick="handleShopToggleWishlist(${p.id}, event)" title="${inWishlist ? 'Remove from Favourites' : 'Add to Favourites'}">
              <i class="fa-${inWishlist ? 'solid text-danger' : 'regular'} fa-heart"></i>
            </button>
            <a href="/product.html?id=${p.slug}" class="product-action-btn" title="View Details">
              <i class="fa-solid fa-eye"></i>
            </a>
          </div>
        </div>
        <div class="product-content">
          <div class="product-category">${p.category_name || 'Category'}</div>
          <h3 class="product-title">
            <a href="/product.html?id=${p.slug}">${p.title}</a>
          </h3>
          <div class="product-meta">
            <div class="product-price-wrapper">
              <span class="product-price">${formatCurrency(p.price)}</span>
              ${p.compare_price ? `<span class="product-compare-price">${formatCurrency(p.compare_price)}</span>` : ''}
            </div>
            
          </div>
          <div class="product-card-footer">
            <button class="btn btn-sm btn-outline-primary btn-block" onclick="window.location.href='/product.html?id=${p.slug}'">
              <i class="fa-solid fa-cart-plus"></i> Discover piece ↗
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function handleShopAddToCart(productId, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  try {
    const res = await api.addToCart(productId, 1);
    if (res.success) {
      State.setCart(res.data);
      showToast('Added to cart ✓', 'success');
    } else {
      showToast(res.message || 'Unable to add product to cart.', 'danger');
    }
  } catch (err) {
    showToast(err.message || 'Unable to add product to cart.', 'danger');
  }
}

async function handleShopToggleWishlist(productId, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  if (!State.user) {
    showToast('Please login to save favourites.', 'warning');
    return;
  }

  const inWishlist = State.wishlist && State.wishlist.some(w => w.id === productId || w.product_id === productId);

  try {
    if (inWishlist) {
      await api.removeFromWishlist(productId);
      showToast('Removed from favourites', 'info');
    } else {
      await api.addToWishlist(productId);
      showToast('Added to favourites ✓', 'success');
    }
    await State.refreshWishlist();
  } catch (err) {
    showToast(err.message || 'Wishlist action failed', 'danger');
  }
}

function renderPagination(pagination) {
  const container = document.getElementById('shop-pagination');
  if (!container) return;

  if (!pagination || pagination.totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = '';

  // Prev
  html += `
    <button class="page-btn" ${pagination.page === 1 ? 'disabled' : ''} onclick="goToPage(${pagination.page - 1})">
      <i class="fa-solid fa-chevron-left"></i>
    </button>
  `;

  // Page Numbers
  for (let i = 1; i <= pagination.totalPages; i++) {
    html += `
      <button class="page-btn ${i === pagination.page ? 'active' : ''}" onclick="goToPage(${i})">
        ${i}
      </button>
    `;
  }

  // Next
  html += `
    <button class="page-btn" ${pagination.page === pagination.totalPages ? 'disabled' : ''} onclick="goToPage(${pagination.page + 1})">
      <i class="fa-solid fa-chevron-right"></i>
    </button>
  `;

  container.innerHTML = html;
}

function goToPage(page) {
  currentFilters.page = page;
  window.scrollTo({ top: 180, behavior: 'smooth' });
  loadShopProducts();
}

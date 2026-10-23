// KICKSZN Product Details Page Controller

let currentProduct = null;
let selectedVariant = null;
let currentQuantity = 1;

document.addEventListener('DOMContentLoaded', async () => {
  await State.init();

  const params = new URLSearchParams(window.location.search);
  const identifier = params.get('id') || params.get('slug') || '1';

  await loadProductDetails(identifier);
  setupTabs();
  setupReviewModal();

  State.subscribe(() => {
    updateWishlistButton();
  });
});

async function loadProductDetails(identifier) {
  try {
    const res = await api.getProduct(identifier);
    if (!res.success || !res.data) {
      window.location.href = '/404.html';
      return;
    }

    currentProduct = res.data;
    document.title = `${currentProduct.title} — Valcerenne`;

    // Render Product Header & Breadcrumb
    const breadcrumbCategory = document.getElementById('breadcrumb-category');
    const breadcrumbTitle = document.getElementById('breadcrumb-title');
    if (breadcrumbCategory) {
      breadcrumbCategory.textContent = currentProduct.category_name;
      breadcrumbCategory.href = `/shop.html?category=${currentProduct.category_slug}`;
    }
    if (breadcrumbTitle) breadcrumbTitle.textContent = currentProduct.title;

    // Gallery
    renderGallery(currentProduct.images);

    // Info
    document.getElementById('product-title').textContent = currentProduct.title;
    document.getElementById('product-sku').textContent = `SKU: ${currentProduct.sku}`;
    document.getElementById('product-price').textContent = formatCurrency(currentProduct.price);

    const comparePriceEl = document.getElementById('product-compare-price');
    const discountEl = document.getElementById('product-discount');
    if (currentProduct.compare_price && currentProduct.compare_price > currentProduct.price) {
      comparePriceEl.textContent = formatCurrency(currentProduct.compare_price);
      comparePriceEl.style.display = 'inline';
      const pct = Math.round((1 - currentProduct.price / currentProduct.compare_price) * 100);
      discountEl.textContent = `Save ${pct}%`;
      discountEl.style.display = 'inline-block';
    } else {
      comparePriceEl.style.display = 'none';
      discountEl.style.display = 'none';
    }

    document.getElementById('product-short-desc').textContent = currentProduct.short_description || currentProduct.description.substring(0, 160);
    document.getElementById('product-rating-box').innerHTML = `${renderStars(currentProduct.rating_avg)} <span style="font-size:0.875rem; color:var(--text-muted);">${currentProduct.rating_avg.toFixed(1)} (${currentProduct.review_count} reviews)</span>`;

    // Stock Status
    const stockEl = document.getElementById('product-stock-status');
    const addBtn = document.getElementById('add-to-cart-btn');
    const buyBtn = document.getElementById('buy-now-btn');

    if (currentProduct.stock_qty > 0) {
      stockEl.innerHTML = `<span class="badge badge-success"><i class="fa-solid fa-check"></i> In Stock (${currentProduct.stock_qty} available)</span>`;
      if (addBtn) addBtn.disabled = false;
      if (buyBtn) buyBtn.disabled = false;
    } else {
      stockEl.innerHTML = `<span class="badge badge-danger"><i class="fa-solid fa-xmark"></i> Out of Stock</span>`;
      if (addBtn) addBtn.disabled = true;
      if (buyBtn) buyBtn.disabled = true;
    }

    // Variants (Sizes & Colors)
    renderVariants(currentProduct.variants);

    // Tab Contents
    document.getElementById('tab-description').innerHTML = `<p style="line-height:1.8; color:var(--text-muted);">${currentProduct.description.replace(/\n/g, '<br><br>')}</p>`;
    
    // Reviews
    renderReviews(currentProduct.reviews, currentProduct.rating_avg, currentProduct.review_count);

    // Related Products
    loadRelatedProducts(currentProduct.id);

    // Wishlist check
    updateWishlistButton();

  } catch (err) {
    console.error('Error loading product details:', err);
    window.location.href = '/404.html';
  }
}

function renderGallery(images) {
  const mainImg = document.getElementById('main-product-image');
  const thumbsContainer = document.getElementById('gallery-thumbnails');

  const fallbackImg = '/assets/image-unavailable.svg';
  const imgList = images && images.length > 0 ? images : [{ image_url: fallbackImg }];

  mainImg.src = imgList[0].image_url;
  mainImg.onerror = () => { mainImg.onerror=null; mainImg.src='/assets/image-unavailable.svg'; };
  mainImg.alt = currentProduct ? currentProduct.title : 'Product Image';

  if (thumbsContainer) {
    thumbsContainer.innerHTML = imgList.map((img, idx) => `
      <div class="thumb-item ${idx === 0 ? 'active' : ''}" onclick="switchMainImage('${img.image_url}', this)">
        <img src="${img.image_url}" alt="Thumbnail ${idx + 1}" loading="lazy" onerror="this.onerror=null; this.src='${fallbackImg}';">
      </div>
    `).join('');
  }
}

function switchMainImage(url, element) {
  const mainImg = document.getElementById('main-product-image');
  mainImg.src = url;
  document.querySelectorAll('.thumb-item').forEach(t => t.classList.remove('active'));
  element.classList.add('active');
}

function renderVariants(variants) {
  const container = document.getElementById('variants-container');
  if (!container) return;

  if (!variants || variants.length === 0) {
    container.innerHTML = '';
    selectedVariant = null;
    return;
  }

  // Check if variants have colors or sizes
  const colors = [...new Set(variants.map(v => v.color).filter(Boolean))];
  const sizes = [...new Set(variants.map(v => v.size).filter(Boolean))];

  let html = '';

  if (sizes.length > 0) {
    html += `
      <div class="variant-selector-group">
        <label class="variant-label"><span>Select Size</span> <span id="selected-size-label" style="font-weight:700; color:var(--primary);">${sizes[0]}</span></label>
        <div class="variant-options">
          ${sizes.map((s, i) => `
            <button type="button" class="variant-btn ${i === 0 ? 'active' : ''}" onclick="selectSize('${s}', this)">
              ${s}
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  if (colors.length > 0) {
    html += `
      <div class="variant-selector-group">
        <label class="variant-label"><span>Select Color</span> <span id="selected-color-label" style="font-weight:700; color:var(--primary);">${colors[0]}</span></label>
        <div class="variant-options">
          ${colors.map((c, i) => `
            <button type="button" class="variant-btn ${i === 0 ? 'active' : ''}" onclick="selectColor('${c}', this)">
              ${c}
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
  selectedVariant = variants[0];
  matchVariant();
}

function selectColor(color, btn) {
  const label = document.getElementById('selected-color-label');
  if (label) label.textContent = color;
  btn.closest('.variant-options').querySelectorAll('.variant-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  matchVariant();
}

function selectSize(size, btn) {
  const label = document.getElementById('selected-size-label');
  if (label) label.textContent = size;
  btn.closest('.variant-options').querySelectorAll('.variant-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  matchVariant();
}

function matchVariant() {
  if (!currentProduct || !currentProduct.variants || currentProduct.variants.length === 0) return;

  const colorEl = document.getElementById('selected-color-label');
  const sizeEl = document.getElementById('selected-size-label');

  const selectedColor = colorEl ? colorEl.textContent.trim() : null;
  const selectedSize = sizeEl ? sizeEl.textContent.trim() : null;

  const match = currentProduct.variants.find(v => {
    const matchColor = !selectedColor || v.color === selectedColor;
    const matchSize = !selectedSize || v.size === selectedSize;
    return matchColor && matchSize;
  });

  if (match) {
    selectedVariant = match;
    if (match.price_override) {
      document.getElementById('product-price').textContent = formatCurrency(match.price_override);
    } else {
      document.getElementById('product-price').textContent = formatCurrency(currentProduct.price);
    }
  } else {
    selectedVariant = null;
  }
  const available=selectedVariant ? Math.min(selectedVariant.stock_qty,currentProduct.stock_qty) : 0;
  document.getElementById('product-stock-status').textContent=available>0?'In stock':'This combination is unavailable';
  document.getElementById('add-to-cart-btn').disabled=available<=0;
  document.getElementById('buy-now-btn').disabled=available<=0;
  const qty=document.getElementById('product-qty-input');qty.max=available;qty.value=available>0?Math.min(Number(qty.value)||1,available):1;
}

function changeQuantity(delta) {
  const input = document.getElementById('product-qty-input');
  let val = parseInt(input.value, 10) || 1;
  const maxLimit = selectedVariant && selectedVariant.stock_qty ? selectedVariant.stock_qty : (currentProduct ? currentProduct.stock_qty : 99);
  val = Math.max(1, Math.min(val + delta, maxLimit));
  input.value = val;
  currentQuantity = val;
}

async function handleAddToCart() {
  if (!currentProduct) return false;
  if(currentProduct.variants?.length && !selectedVariant){showToast('Please choose your preferred variant.', 'warning');return false;}
  const qtyInput = document.getElementById('product-qty-input');
  const qty = parseInt(qtyInput ? qtyInput.value : 1, 10) || 1;
  const variantId = selectedVariant ? selectedVariant.id : null;

  try {
    const res = await api.addToCart(currentProduct.id, qty, variantId);
    if (res.success) {
      State.setCart(res.data);
      showToast('Added to your bag', 'success');
      return true;
    } else {
      showToast(res.message || 'Unable to add product to cart.', 'danger');
    }
  } catch (err) {
    showToast(err.message || 'Unable to add product to cart.', 'danger');
  }
}

async function handleBuyNow() {
  if(await handleAddToCart()) window.location.href = '/checkout.html';
}

function updateWishlistButton() {
  const btn = document.getElementById('product-wishlist-btn');
  if (!btn || !currentProduct) return;

  const inWishlist = State.wishlist && State.wishlist.some(w => w.id === currentProduct.id || w.product_id === currentProduct.id);
  btn.innerHTML = `<i class="fa-${inWishlist ? 'solid text-danger' : 'regular'} fa-heart"></i> ${inWishlist ? '♥ Saved' : '♡ Add to favourites'}`;
  btn.className = `btn btn-lg ${inWishlist ? 'btn-outline-primary' : 'btn-outline'}`;
}

async function toggleProductWishlist() {
  if (!State.user) {
    showToast('Please login to save favourites.', 'warning');
    return;
  }

  const inWishlist = State.wishlist && State.wishlist.some(w => w.id === currentProduct.id || w.product_id === currentProduct.id);
  try {
    if (inWishlist) {
      const res = await api.removeFromWishlist(currentProduct.id);
      showToast('Removed from favourites', 'info');
    } else {
      const res = await api.addToWishlist(currentProduct.id);
      showToast('Added to favourites ✓', 'success');
    }
    await State.refreshWishlist();
    updateWishlistButton();
  } catch (err) {
    showToast(err.message || 'Wishlist action failed', 'danger');
  }
}

function setupTabs() {
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabTarget = btn.getAttribute('data-tab');
      tabBtns.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content-pane').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const pane = document.getElementById(tabTarget);
      if (pane) pane.classList.add('active');
    });
  });
}

function renderReviews(reviews, avgRating, totalCount) {
  const container = document.getElementById('reviews-list-container');
  const avgEl = document.getElementById('reviews-avg-rating');
  const countEl = document.getElementById('reviews-total-count');

  if (avgEl) avgEl.textContent = avgRating.toFixed(1);
  if (countEl) countEl.textContent = `${totalCount} Ratings`;

  if (!container) return;

  if (!reviews || reviews.length === 0) {
    container.innerHTML = `<p style="color:var(--text-muted); text-align:center; padding:2rem 0;">No reviews yet. Be the first to review this piece!</p>`;
    return;
  }

  container.innerHTML = reviews.map(r => `
    <div class="review-card">
      <div class="review-header">
        <div class="reviewer-meta">
          <div class="reviewer-avatar">
            ${r.user_avatar ? `<img src="${r.user_avatar}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">` : (r.user_name || 'Customer').charAt(0)}
          </div>
          <div>
            <div style="font-weight:700; font-size:0.9375rem;">${escapeHTML(r.user_name || 'Customer')}</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">${new Date(r.created_at).toLocaleDateString()}</div>
          </div>
        </div>
        ${r.is_verified_purchase ? '<span class="badge badge-success"><i class="fa-solid fa-circle-check"></i> Verified Purchase</span>' : ''}
      </div>
      <div style="margin: 0.5rem 0;">
        ${renderStars(r.rating)}
      </div>
      <h4 style="font-size:1rem; font-weight:700; margin-bottom:0.35rem;">${escapeHTML(r.title)}</h4>
      <p style="color:var(--text-muted); font-size:0.9rem; line-height:1.6;">${escapeHTML(r.comment)}</p>
      <div style="margin-top:0.75rem;">
        <button class="btn btn-sm btn-outline" onclick="handleVoteHelpful(${r.id}, this)">
          <i class="fa-regular fa-thumbs-up"></i> Helpful (${r.helpful_votes || 0})
        </button>
      </div>
    </div>
  `).join('');
}

async function handleVoteHelpful(reviewId, btn) {
  try {
    await api.voteHelpful(reviewId);
    btn.classList.add('btn-primary');
    btn.disabled = true;
    showToast('Thank you for your feedback!', 'success');
  } catch (e) {
    showToast('Failed to register vote', 'danger');
  }
}

function setupReviewModal() {
  const openBtn = document.getElementById('open-write-review-btn');
  const modal = document.getElementById('review-modal');
  const closeBtn = document.getElementById('close-review-modal');
  const form = document.getElementById('write-review-form');

  if (openBtn && modal) {
    openBtn.addEventListener('click', () => {
      if (!State.user) {
        showToast('Please login to write a review.', 'warning');
        setTimeout(() => window.location.href = '/login.html', 1200);
        return;
      }
      modal.classList.add('active');
    });
  }

  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => modal.classList.remove('active'));
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const rating = form.querySelector('input[name="rating"]:checked')?.value || 5;
      const title = form.querySelector('#review-title').value.trim();
      const comment = form.querySelector('#review-comment').value.trim();

      try {
        const res = await api.createReview({
          product_id: currentProduct.id,
          productId: currentProduct.id,
          rating: parseInt(rating, 10),
          title,
          comment
        });

        if (res.success) {
          showToast('Review posted successfully!', 'success');
          modal.classList.remove('active');
          form.reset();
          await loadProductDetails(currentProduct.slug);
        }
      } catch (err) {
        showToast(err.message || 'Failed to submit review', 'danger');
      }
    });
  }
}

async function loadRelatedProducts(productId) {
  const container = document.getElementById('related-products-grid');
  if (!container) return;

  try {
    const res = await api.getRelatedProducts(productId);
    if (res.success && res.data.length > 0) {
      container.innerHTML = res.data.map(p => `
        <div class="product-card">
          <div class="product-thumb">
            <img src="${p.primary_image || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=400&q=80'}" alt="${p.title}" loading="lazy" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=400&q=80';">
          </div>
          <div class="product-content">
            <div class="product-category">${p.category_name || ''}</div>
            <h3 class="product-title"><a href="/product.html?id=${p.slug}">${p.title}</a></h3>
            <div class="product-meta">
              <span class="product-price">${formatCurrency(p.price)}</span>
              ${renderStars(p.rating_avg)}
            </div>
          </div>
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Failed to load related products:', err);
  }
}

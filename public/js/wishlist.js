// KICKSZN Wishlist Page Controller

document.addEventListener('DOMContentLoaded', async () => {
  await State.init();
  loadWishlistPage();

  State.subscribe(() => {
    loadWishlistPage();
  });
});

async function loadWishlistPage() {
  const container = document.getElementById('wishlist-grid-container');
  if (!container) return;

  if (!State.user) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 1rem;">
        <i class="fa-solid fa-heart" style="font-size: 3rem; color: var(--text-light); margin-bottom: 1rem;"></i>
        <h3>Please log in to view your favourites</h3>
        <p style="color: var(--text-muted); margin-top: 0.5rem;">Save your favorite pieces to access them anytime.</p>
        <a href="/login.html" class="btn btn-primary" style="margin-top: 1.5rem;">Sign In</a>
      </div>
    `;
    return;
  }

  try {
    const res = await api.getWishlist();
    if (res.success) {
      const items = res.data;
      if (items.length === 0) {
        container.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 1rem;">
            <i class="fa-regular fa-heart" style="font-size: 3rem; color: var(--text-light); margin-bottom: 1rem;"></i>
            <h3>Your wishlist is empty</h3>
            <p style="color: var(--text-muted); margin-top: 0.5rem;">Explore our latest arrivals and click the heart icon to save your favourites.</p>
            <a href="/shop.html" class="btn btn-primary" style="margin-top: 1.5rem;">Explore Catalog</a>
          </div>
        `;
        return;
      }

      container.innerHTML = items.map(p => `
        <div class="product-card">
          <div class="product-thumb">
            <img src="${p.primary_image || 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=400&q=80'}" alt="${p.title}" loading="lazy" onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=400&q=80';">
            <div class="product-actions" style="opacity: 1; transform: none;">
              <button class="product-action-btn" onclick="removeFromWishlistPage(${p.id})" title="Remove from Favourites">
                <i class="fa-solid fa-trash-can text-danger"></i>
              </button>
            </div>
          </div>
          <div class="product-content">
            <div class="product-category">${p.category_name || 'Collection'}</div>
            <h3 class="product-title"><a href="/product.html?id=${p.slug}">${p.title}</a></h3>
            <div class="product-meta">
              <span class="product-price">${formatCurrency(p.price)}</span>
              ${renderStars(p.rating_avg, p.review_count)}
            </div>
            <div class="product-card-footer">
              <button class="btn btn-sm btn-primary btn-block" onclick="window.location.href='/product.html?id=${p.slug}'">
                <i class="fa-solid fa-cart-plus"></i> Choose options ↗
              </button>
            </div>
          </div>
        </div>
      `).join('');
    }
  } catch (err) {
    container.innerHTML = `<div style="grid-column: 1 / -1; color: var(--danger); text-align: center;">Failed to load wishlist.</div>`;
  }
}

async function removeFromWishlistPage(productId) {
  try {
    const res = await api.removeFromWishlist(productId);
    if (res.success) {
      showToast('Removed from favourites', 'info');
      await State.refreshWishlist();
      loadWishlistPage();
    }
  } catch (err) {
    showToast('Failed to remove item', 'danger');
  }
}

async function moveWishlistToCart(productId) {
  try {
    const res = await api.addToCart(productId, 1);
    if (res.success) {
      State.setCart(res.data);
      await api.removeFromWishlist(productId);
      await State.refreshWishlist();
      showToast('Added to cart ✓', 'success');
      loadWishlistPage();
    } else {
      showToast(res.message || 'Unable to add product to cart.', 'danger');
    }
  } catch (err) {
    showToast(err.message || 'Unable to add product to cart.', 'danger');
  }
}

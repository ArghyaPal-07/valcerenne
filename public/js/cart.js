// Shopping Cart Controller

let appliedCoupon = null;

document.addEventListener('DOMContentLoaded', async () => {
  await State.init();
  renderCartPage(State.cart);
  State.subscribe((st) => renderCartPage(st.cart));
  setupCouponForm();
});

function renderCartPage(cart) {
  const container = document.getElementById('cart-items-tbody');
  const emptyState = document.getElementById('cart-empty-view');
  const fullState = document.getElementById('cart-content-view');

  if (!container) return;

  if (!cart || !cart.items || cart.items.length === 0) {
    if (emptyState) emptyState.style.display = 'block';
    if (fullState) fullState.style.display = 'none';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  if (fullState) fullState.style.display = 'grid';

  container.innerHTML = cart.items.map(item => `
    <tr>
      <td>
        <div class="cart-product-cell">
          <img src="${item.image_url || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=100'}" class="cart-product-img" alt="${item.product_title}">
          <div>
            <h4 class="cart-product-title"><a href="/product.html?id=${item.product_slug}">${item.product_title}</a></h4>
            ${item.variant_color || item.variant_size ? `<div class="cart-product-meta">${[item.variant_color, item.variant_size].filter(Boolean).join(' / ')}</div>` : ''}
          </div>
        </div>
      </td>
      <td style="font-weight:600;">${formatCurrency(item.price)}</td>
      <td>
        <div class="quantity-picker" style="height: 2.25rem; width: 110px;">
          <button class="qty-btn" onclick="updateItemQuantity(${item.item_id}, ${item.quantity - 1})">-</button>
          <input type="text" class="qty-input" value="${item.quantity}" readonly>
          <button class="qty-btn" onclick="updateItemQuantity(${item.item_id}, ${item.quantity + 1})">+</button>
        </div>
      </td>
      <td style="font-weight:700; color:var(--primary);">${formatCurrency(item.subtotal)}</td>
      <td style="text-align: right;">
        <button class="btn-icon btn-outline text-danger" onclick="removeCartItem(${item.item_id})" title="Remove item">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </td>
    </tr>
  `).join('');

  updateCartSummary(cart.subtotal);
}

function updateCartSummary(subtotal) {
  const subtotalEl = document.getElementById('summary-subtotal');
  const discountRow = document.getElementById('summary-discount-row');
  const discountEl = document.getElementById('summary-discount');
  const taxEl = document.getElementById('summary-tax');
  const shippingEl = document.getElementById('summary-shipping');
  const totalEl = document.getElementById('summary-total');

  if (subtotalEl) subtotalEl.textContent = formatCurrency(subtotal);

  let discount = 0;
  if (appliedCoupon && appliedCoupon.code !== 'FREESHIP') {
    if (appliedCoupon.discount_type === 'percentage') {
      discount = (subtotal * appliedCoupon.discount_value) / 100;
      if (appliedCoupon.max_discount && discount > appliedCoupon.max_discount) {
        discount = appliedCoupon.max_discount;
      }
    } else {
      discount = Math.min(subtotal, appliedCoupon.discount_value);
    }
  }

  if (discountRow && discountEl) {
    if (discount > 0) {
      discountRow.style.display = 'flex';
      discountEl.textContent = `-${formatCurrency(discount)}`;
    } else {
      discountRow.style.display = 'none';
    }
  }

  const taxable = Math.max(0, subtotal - discount);
  const tax = taxable * 0.08;
  const shipping = (subtotal >= 999 || (appliedCoupon && appliedCoupon.code === 'FREESHIP')) ? 0.00 : (subtotal > 0 ? 149.00 : 0.00);
  const total = taxable + tax + shipping;

  if (taxEl) taxEl.textContent = formatCurrency(tax);
  if (shippingEl) shippingEl.textContent = shipping === 0 ? 'FREE' : formatCurrency(shipping);
  if (totalEl) totalEl.textContent = formatCurrency(total);
}

async function updateItemQuantity(itemId, newQty) {
  try {
    const res = await api.updateCartItem(itemId, newQty);
    if (res.success) {
      State.setCart(res.data);
    }
  } catch (err) {
    showToast(err.message || 'Failed to update quantity', 'danger');
  }
}

async function removeCartItem(itemId) {
  try {
    const res = await api.removeCartItem(itemId);
    if (res.success) {
      State.setCart(res.data);
      showToast('Item removed from cart', 'info');
    }
  } catch (err) {
    showToast('Failed to remove item', 'danger');
  }
}

async function clearEntireCart() {
  if (!confirm('Are you sure you want to clear all items in your cart?')) return;
  try {
    const res = await api.clearCart();
    if (res.success) {
      State.setCart(res.data);
      showToast('Cart cleared', 'info');
    }
  } catch (err) {
    showToast('Failed to clear cart', 'danger');
  }
}

function setupCouponForm() {
  const form = document.getElementById('cart-coupon-form');
  const input = document.getElementById('coupon-code-input');
  const badgeContainer = document.getElementById('applied-coupon-badge');

  if (!form || !input) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = input.value.trim();
    if (!code) return;

    try {
      const res = await api.validateCoupon(code, State.cart.subtotal);
      if (res.success) {
        appliedCoupon = res.data;
        sessionStorage.setItem('nexus_active_coupon', JSON.stringify(appliedCoupon));
        showToast(res.message, 'success');

        if (badgeContainer) {
          badgeContainer.innerHTML = `
            <div class="badge badge-success" style="display:flex; align-items:center; gap:0.5rem; padding:0.4rem 0.8rem; font-size:0.85rem;">
              <span><i class="fa-solid fa-tag"></i> ${appliedCoupon.code} Applied</span>
              <button onclick="removeAppliedCoupon()" style="background:none; border:none; color:inherit; cursor:pointer;"><i class="fa-solid fa-xmark"></i></button>
            </div>
          `;
        }
        updateCartSummary(State.cart.subtotal);
      }
    } catch (err) {
      showToast(err.message || 'Invalid coupon code', 'danger');
    }
  });

  // Restore coupon from sessionStorage if present
  const savedCoupon = sessionStorage.getItem('nexus_active_coupon');
  if (savedCoupon) {
    try {
      appliedCoupon = JSON.parse(savedCoupon);
      if (badgeContainer) {
        badgeContainer.innerHTML = `
          <div class="badge badge-success" style="display:flex; align-items:center; gap:0.5rem; padding:0.4rem 0.8rem; font-size:0.85rem;">
            <span><i class="fa-solid fa-tag"></i> ${appliedCoupon.code} Applied</span>
            <button onclick="removeAppliedCoupon()" style="background:none; border:none; color:inherit; cursor:pointer;"><i class="fa-solid fa-xmark"></i></button>
          </div>
        `;
      }
    } catch (e) {}
  }
}

function removeAppliedCoupon() {
  appliedCoupon = null;
  sessionStorage.removeItem('nexus_active_coupon');
  const badgeContainer = document.getElementById('applied-coupon-badge');
  if (badgeContainer) badgeContainer.innerHTML = '';
  showToast('Coupon removed', 'info');
  updateCartSummary(State.cart.subtotal);
}

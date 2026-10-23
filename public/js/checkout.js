// Checkout Page Controller

let checkoutCoupon = null;
let savedAddresses = [];

document.addEventListener('DOMContentLoaded', async () => {
  await State.init();

  if (!State.cart || !State.cart.items || State.cart.items.length === 0) {
    showToast('Your cart is empty. Redirecting to shop...', 'warning');
    setTimeout(() => window.location.href = '/shop.html', 1500);
    return;
  }

  // Load saved coupon
  const savedCoupon = sessionStorage.getItem('nexus_active_coupon');
  if (savedCoupon) {
    try {
      checkoutCoupon = JSON.parse(savedCoupon);
    } catch (e) {}
  }

  renderCheckoutOrderSummary();
  await setupUserAddresses();
  setupPaymentMethods();
  setupCheckoutForm();
});

function renderCheckoutOrderSummary() {
  const itemsContainer = document.getElementById('checkout-items-list');
  const subtotalEl = document.getElementById('checkout-subtotal');
  const discountRow = document.getElementById('checkout-discount-row');
  const discountEl = document.getElementById('checkout-discount');
  const taxEl = document.getElementById('checkout-tax');
  const shippingEl = document.getElementById('checkout-shipping');
  const totalEl = document.getElementById('checkout-total');

  const cart = State.cart;

  if (itemsContainer) {
    itemsContainer.innerHTML = cart.items.map(item => `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; font-size:0.875rem;">
        <div style="display:flex; align-items:center; gap:0.75rem;">
          <img src="${item.image_url || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=100'}" style="width:48px; height:48px; border-radius:var(--radius-sm); object-fit:cover;">
          <div>
            <div style="font-weight:600;">${item.product_title}</div>
            <div style="color:var(--text-muted); font-size:0.75rem;">Qty: ${item.quantity} ${item.variant_color ? `• ${item.variant_color}` : ''}</div>
          </div>
        </div>
        <div style="font-weight:700;">${formatCurrency(item.subtotal)}</div>
      </div>
    `).join('');
  }

  const subtotal = cart.subtotal;
  let discount = 0;

  if (checkoutCoupon && checkoutCoupon.code !== 'FREESHIP') {
    if (checkoutCoupon.discount_type === 'percentage') {
      discount = (subtotal * checkoutCoupon.discount_value) / 100;
      if (checkoutCoupon.max_discount && discount > checkoutCoupon.max_discount) {
        discount = checkoutCoupon.max_discount;
      }
    } else {
      discount = Math.min(subtotal, checkoutCoupon.discount_value);
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
  const shipping = (subtotal >= 999 || (checkoutCoupon && checkoutCoupon.code === 'FREESHIP')) ? 0.00 : 149.00;
  const total = taxable + tax + shipping;

  if (subtotalEl) subtotalEl.textContent = formatCurrency(subtotal);
  if (taxEl) taxEl.textContent = formatCurrency(tax);
  if (shippingEl) shippingEl.textContent = shipping === 0 ? 'FREE' : formatCurrency(shipping);
  if (totalEl) totalEl.textContent = formatCurrency(total);
}

async function setupUserAddresses() {
  const addressSelectBox = document.getElementById('saved-address-selector-box');
  const addressSelect = document.getElementById('saved-address-select');

  if (State.user) {
    // Pre-fill email and name
    const emailInput = document.getElementById('cust-email');
    const nameInput = document.getElementById('ship-name');
    const phoneInput = document.getElementById('ship-phone');

    if (emailInput) emailInput.value = State.user.email;
    if (nameInput) nameInput.value = State.user.full_name;
    if (phoneInput && State.user.phone) phoneInput.value = State.user.phone;

    try {
      const res = await api.getAddresses();
      if (res.success && res.data.length > 0) {
        savedAddresses = res.data;
        if (addressSelectBox && addressSelect) {
          addressSelectBox.style.display = 'block';
          addressSelect.innerHTML = `
            <option value="">-- Choose a saved address or enter new --</option>
            ${savedAddresses.map(a => `
              <option value="${a.id}">${a.full_name} - ${a.address_line1}, ${a.city}, ${a.state}</option>
            `).join('')}
          `;

          addressSelect.addEventListener('change', (e) => {
            const selectedId = parseInt(e.target.value, 10);
            const addr = savedAddresses.find(a => a.id === selectedId);
            if (addr) {
              document.getElementById('ship-name').value = addr.full_name;
              document.getElementById('ship-phone').value = addr.phone;
              document.getElementById('ship-addr1').value = addr.address_line1;
              document.getElementById('ship-addr2').value = addr.address_line2 || '';
              document.getElementById('ship-city').value = addr.city;
              document.getElementById('ship-state').value = addr.state;
              document.getElementById('ship-zip').value = addr.postal_code;
              document.getElementById('ship-country').value = addr.country;
            }
          });
        }
      }
    } catch (e) {}
  }
}

function setupPaymentMethods() {
  const cards = document.querySelectorAll('.payment-method-card');
  const cardForm = document.getElementById('credit-card-form');

  cards.forEach(card => {
    card.addEventListener('click', () => {
      cards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      const method = card.getAttribute('data-method');
      if (cardForm) {
        cardForm.style.display = method === 'card' ? 'block' : 'none';
      }
    });
  });
}

function setupCheckoutForm() {
  const form = document.getElementById('checkout-main-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('ship-name').value.trim();
    const phone = document.getElementById('ship-phone').value.trim();
    const addr1 = document.getElementById('ship-addr1').value.trim();
    const addr2 = document.getElementById('ship-addr2').value.trim();
    const city = document.getElementById('ship-city').value.trim();
    const state = document.getElementById('ship-state').value.trim();
    const zip = document.getElementById('ship-zip').value.trim();
    const country = document.getElementById('ship-country').value.trim();
    const notes = document.getElementById('order-notes')?.value.trim();

    const activePaymentCard = document.querySelector('.payment-method-card.active');
    const paymentMethod = activePaymentCard ? activePaymentCard.getAttribute('data-method') : 'cod';

    if (!name || !phone || !addr1 || !city || !state || !zip) {
      showToast('Please fill in all required shipping address fields.', 'danger');
      return;
    }

    const shipping_address = {
      full_name: name,
      email: document.getElementById('cust-email').value.trim(),
      phone,
      address_line1: addr1,
      address_line2: addr2 || null,
      city,
      state,
      postal_code: zip,
      country: country || 'India'
    };

    const submitBtn = document.getElementById('place-order-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing Order...';
    }

    try {
      const res = await api.checkout({
        shipping_address,
        billing_address: shipping_address,
        payment_method: paymentMethod,
        coupon_code: checkoutCoupon ? checkoutCoupon.code : null,
        notes: notes || null
      });

      if (!res.success) throw new Error(res.message || 'Order could not be created.');
      if (res.success) {
        sessionStorage.removeItem('nexus_active_coupon');
        sessionStorage.setItem('nexus_last_order', JSON.stringify(res.data));
        await State.refreshCart();
        window.location.href = `/order-success.html?order=${res.data.orderNumber}`;
      }
    } catch (err) {
      showToast(err.message || 'Checkout failed. Please try again.', 'danger');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-lock"></i> Place Order Now';
      }
    }
  });
}

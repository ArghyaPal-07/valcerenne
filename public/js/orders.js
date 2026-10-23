// Order History & Order Details Controller

document.addEventListener('DOMContentLoaded', async () => {
  await State.init();

  const params = new URLSearchParams(window.location.search);
  const orderNumber = params.get('id') || params.get('order');

  if (orderNumber) {
    // Single order view
    await loadSingleOrderDetail(orderNumber);
  } else {
    // Order list view
    await loadUserOrders();
  }
});

async function loadUserOrders() {
  const container = document.getElementById('orders-list-container');
  if (!container) return;

  if (!State.user) {
    container.innerHTML = `
      <div style="text-align: center; padding: 4rem 1rem;">
        <i class="fa-solid fa-lock" style="font-size: 3rem; color: var(--text-light); margin-bottom: 1rem;"></i>
        <h3>Please log in to view your orders</h3>
        <p style="color: var(--text-muted); margin-top: 0.5rem;">Access your purchase history, receipts, and package tracking.</p>
        <a href="/login.html" class="btn btn-primary" style="margin-top: 1.5rem;">Log In to Account</a>
      </div>
    `;
    return;
  }

  try {
    const res = await api.getMyOrders();
    if (res.success) {
      const orders = res.data;
      if (orders.length === 0) {
        container.innerHTML = `
          <div style="text-align: center; padding: 4rem 1rem;">
            <i class="fa-solid fa-box-open" style="font-size: 3rem; color: var(--text-light); margin-bottom: 1rem;"></i>
            <h3>No orders found</h3>
            <p style="color: var(--text-muted); margin-top: 0.5rem;">You haven't placed any orders yet.</p>
            <a href="/shop.html" class="btn btn-primary" style="margin-top: 1.5rem;">Start Shopping</a>
          </div>
        `;
        return;
      }

      container.innerHTML = orders.map(o => `
        <div class="order-history-card">
          <div class="order-card-header">
            <div>
              <span style="font-size: 0.8125rem; color: var(--text-muted);">ORDER #</span>
              <div style="font-weight: 800; font-size: 1.1rem; color: var(--primary);">${o.order_number}</div>
              <span style="font-size: 0.75rem; color: var(--text-muted);">${new Date(o.created_at).toLocaleDateString()}</span>
            </div>
            <div style="text-align: right;">
              <span class="badge badge-${getStatusBadgeClass(o.order_status)}">${o.order_status}</span>
              <div style="font-weight: 800; font-size: 1.1rem; margin-top: 0.25rem;">${formatCurrency(o.total_amount)}</div>
            </div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-top: 1rem;">
            <div style="font-size: 0.875rem; color: var(--text-muted);">
              ${o.total_items || 1} items • Ship to: ${o.shipping_address ? o.shipping_address.city + ', ' + o.shipping_address.state : 'Address on file'}
            </div>
            <a href="/orders.html?order=${o.order_number}" class="btn btn-sm btn-outline">
              <i class="fa-solid fa-file-invoice"></i> View Invoice & Tracking
            </a>
          </div>
        </div>
      `).join('');
    }
  } catch (err) {
    container.innerHTML = `<div style="color: var(--danger); text-align: center;">Failed to load order history.</div>`;
  }
}

async function loadSingleOrderDetail(orderNumber) {
  const container = document.getElementById('single-order-detail-view');
  const listContainer = document.getElementById('orders-list-container');

  if (listContainer) listContainer.style.display = 'none';
  if (container) container.style.display = 'block';

  try {
    const res = await api.getOrderDetail(orderNumber);
    if (!res.success || !res.data) {
      showToast('Order not found', 'danger');
      return;
    }

    const order = res.data;

    document.getElementById('order-detail-number').textContent = order.order_number;
    document.getElementById('order-detail-date').textContent = new Date(order.created_at).toLocaleString();
    document.getElementById('order-detail-status-badge').className = `badge badge-${getStatusBadgeClass(order.order_status)}`;
    document.getElementById('order-detail-status-badge').textContent = order.order_status;
    document.getElementById('order-detail-tracking').textContent = order.tracking_number || 'Pending carrier assignment';

    // Shipping Address
    const addr = order.shipping_address;
    document.getElementById('order-detail-shipping-addr').innerHTML = `
      <strong>${escapeHTML(addr.full_name)}</strong><br>
      ${escapeHTML(addr.address_line1)} ${escapeHTML(addr.address_line2 || '')}<br>
      ${escapeHTML(addr.city)}, ${escapeHTML(addr.state)} ${escapeHTML(addr.postal_code)}<br>
      Phone: ${escapeHTML(addr.phone)}
    `;

    // Items
    const itemsTbody = document.getElementById('order-detail-items-tbody');
    if (itemsTbody) {
      itemsTbody.innerHTML = order.items.map(item => `
        <tr>
          <td style="padding: 1rem 0; border-bottom: 1px solid var(--border-light);">
            <div style="display: flex; align-items: center; gap: 1rem;">
              <img src="${item.product_image || 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=100'}" style="width: 50px; height: 50px; border-radius: var(--radius-sm); object-fit: cover;">
              <div>
                <div style="font-weight: 700;">${item.product_title}</div>
                ${item.variant_info ? `<div style="font-size: 0.75rem; color: var(--text-muted);">${item.variant_info}</div>` : ''}
              </div>
            </div>
          </td>
          <td style="text-align: center; border-bottom: 1px solid var(--border-light);">${item.quantity}</td>
          <td style="text-align: right; border-bottom: 1px solid var(--border-light); font-weight: 700;">${formatCurrency(item.subtotal)}</td>
        </tr>
      `).join('');
    }

    // Totals
    document.getElementById('order-detail-subtotal').textContent = formatCurrency(order.subtotal);
    document.getElementById('order-detail-discount').textContent = `-${formatCurrency(order.discount_amount)}`;
    document.getElementById('order-detail-tax').textContent = formatCurrency(order.tax_amount);
    document.getElementById('order-detail-shipping').textContent = order.shipping_fee === 0 ? 'FREE' : formatCurrency(order.shipping_fee);
    document.getElementById('order-detail-total').textContent = formatCurrency(order.total_amount);

    // Timeline History
    renderTrackingTimeline(order.history, order.order_status);

  } catch (err) {
    showToast('Failed to load order details', 'danger');
  }
}

function renderTrackingTimeline(history, currentStatus) {
  const steps = ['pending', 'processing', 'shipped', 'delivered'];
  const currentIdx = steps.indexOf(currentStatus.toLowerCase());

  const container = document.getElementById('order-tracking-stepper');
  if (!container) return;

  container.innerHTML = steps.map((step, idx) => {
    const isCompleted = idx <= currentIdx;
    const isActive = idx === currentIdx;
    return `
      <div class="timeline-step ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}">
        <div class="timeline-dot">
          <i class="fa-solid fa-${isCompleted ? 'check' : 'circle'}"></i>
        </div>
        <div class="timeline-label" style="text-transform: capitalize;">${step}</div>
      </div>
    `;
  }).join('');
}

function getStatusBadgeClass(status) {
  switch (status.toLowerCase()) {
    case 'delivered': return 'success';
    case 'shipped': return 'info';
    case 'processing': return 'warning';
    case 'cancelled': return 'danger';
    default: return 'primary';
  }
}

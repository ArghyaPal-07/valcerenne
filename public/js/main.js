// Global Header, Navigation, Cart Drawer & Search Logic

document.addEventListener("DOMContentLoaded", async () => {
  // Initialize State
  await State.init();

  // Update UI based on initial state
  updateHeaderUI(State);
  State.subscribe(updateHeaderUI);

  // Setup Cart Drawer toggles
  setupCartDrawer();

  // Setup Search inputs
  setupSearch();

  // Setup Mobile Nav
  setupMobileNav();

  // Setup Newsletter forms
  setupNewsletter();
});

function updateHeaderUI(state) {
  // Cart badge
  const cartBadges = document.querySelectorAll(".cart-badge");
  const count = state.cart ? state.cart.totalItems || 0 : 0;
  cartBadges.forEach((b) => {
    b.textContent = count;
    b.style.display = count > 0 ? "inline-flex" : "none";
  });

  // Wishlist badge
  const wishBadges = document.querySelectorAll(".wishlist-badge");
  const wishCount = state.wishlist ? state.wishlist.length : 0;
  wishBadges.forEach((b) => {
    b.textContent = wishCount;
    b.style.display = wishCount > 0 ? "inline-flex" : "none";
  });

  // Auth User Dropdown vs Login link
  const authContainers = document.querySelectorAll(".user-auth-slot");
  authContainers.forEach((container) => {
    if (state.user) {
      container.innerHTML = `
        <div class="user-menu-wrapper">
          <button class="action-btn" title="Account">
            <i class="fa-solid fa-user"></i>
          </button>
          <div class="user-dropdown">
            <div style="padding: 0.5rem 1.25rem; font-weight: 700; font-size: 0.85rem; border-bottom: 1px solid var(--border-color);">
              ${escapeHTML(state.user.full_name)}
              <div style="font-size: 0.75rem; font-weight: 400; color: var(--text-muted);">${escapeHTML(state.user.email)}</div>
            </div>
            <a href="/account.html" class="dropdown-item"><i class="fa-solid fa-gauge-high"></i> Dashboard</a>
            <a href="/orders.html" class="dropdown-item"><i class="fa-solid fa-box-archive"></i> My Orders</a>
            <a href="/wishlist.html" class="dropdown-item"><i class="fa-solid fa-heart"></i> Wishlist</a>
            <a href="/addresses.html" class="dropdown-item"><i class="fa-solid fa-map-location-dot"></i> Addresses</a>
            <div class="dropdown-divider"></div>
            <a href="#" onclick="State.logout(); return false;" class="dropdown-item text-danger"><i class="fa-solid fa-right-from-bracket"></i> Logout</a>
          </div>
        </div>
      `;
    } else {
      container.innerHTML = `
        <a href="/login.html" class="action-btn" aria-label="Account">
          <i class="fa-regular fa-user"></i>
        </a>
      `;
    }
  });

  // Render cart drawer items
  renderCartDrawerItems(state.cart);
}

function setupCartDrawer() {
  const overlay = document.getElementById("cart-drawer-overlay");
  const openButtons = document.querySelectorAll(".open-cart-drawer");
  const closeButton = document.getElementById("close-cart-drawer");

  if (!overlay) return;

  openButtons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      overlay.classList.add("active");
    });
  });

  if (closeButton) {
    closeButton.addEventListener("click", () => {
      overlay.classList.remove("active");
    });
  }

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      overlay.classList.remove("active");
    }
  });
}

function renderCartDrawerItems(cart) {
  const container = document.getElementById("cart-drawer-items-list");
  const subtotalEl = document.getElementById("cart-drawer-subtotal-val");
  if (!container) return;

  if (!cart || !cart.items || cart.items.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
        <i class="fa-solid fa-basket-shopping" style="font-size: 3rem; margin-bottom: 1rem; opacity: 0.4;"></i>
        <p style="font-weight: 600;">Your cart is empty.</p>
        <a href="/shop.html" class="btn btn-sm btn-primary" style="margin-top: 1rem;">Explore Products</a>
      </div>
    `;
    if (subtotalEl) subtotalEl.textContent = formatCurrency(0);
    return;
  }

  container.innerHTML = cart.items
    .map(
      (item) => `
    <div class="cart-drawer-item">
      <img src="${item.image_url || "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=100"}" class="cart-drawer-img" alt="${item.product_title}">
      <div class="cart-drawer-details">
        <h4 class="cart-drawer-title"><a href="/product.html?id=${item.product_slug}">${item.product_title}</a></h4>
        ${item.variant_color || item.variant_size ? `<div class="cart-drawer-variant">${[item.variant_color, item.variant_size].filter(Boolean).join(" / ")}</div>` : ""}
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.4rem;">
          <span class="cart-drawer-price">${formatCurrency(item.price)} × ${item.quantity}</span>
          <button onclick="handleRemoveCartItem(${item.item_id})" style="background:none; border:none; color:var(--text-muted); cursor:pointer; font-size:0.85rem;" title="Remove">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </div>
    </div>
  `,
    )
    .join("");

  if (subtotalEl) {
    subtotalEl.textContent = formatCurrency(cart.subtotal);
  }
}

async function handleRemoveCartItem(itemId) {
  try {
    const res = await api.removeCartItem(itemId);
    if (res.success) {
      State.setCart(res.data);
      showToast("Item removed from cart", "info");
    }
  } catch (err) {
    showToast("Failed to remove item", "danger");
  }
}

function setupSearch() {
  const searchInputs = document.querySelectorAll(".header-search input");
  searchInputs.forEach((input) => {
    input.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        const val = input.value.trim();
        if (val) {
          window.location.href = `/shop.html?search=${encodeURIComponent(val)}`;
        }
      }
    });
  });
}

function setupMobileNav() {
  const toggleBtn = document.getElementById("mobile-menu-toggle");
  const mobileNav = document.getElementById("mobile-nav-menu");

  if (toggleBtn && mobileNav) {
    toggleBtn.addEventListener("click", () => {
      const expanded = mobileNav.classList.toggle("active");
      toggleBtn.setAttribute("aria-expanded", String(expanded));
    });
  }
}

function setupNewsletter() {
  const forms = document.querySelectorAll(".newsletter-form");
  forms.forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = form.querySelector('input[type="email"]');
      if (!input || !input.value.trim()) return;

      try {
        const res = await api.subscribeNewsletter(input.value.trim());
        showToast(res.message, "success");
        input.value = "";
      } catch (err) {
        showToast(err.message || "Subscription failed", "danger");
      }
    });
  });
}

// Shared discovery controls and keyboard behaviour.
function escapeHTML(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
document.addEventListener("DOMContentLoaded", () => {
  const panel = document.getElementById("site-search"),
    toggle = document.getElementById("search-toggle");
  function closeSearch() {
    if (panel) panel.hidden = true;
    toggle?.setAttribute("aria-expanded", "false");
  }
  toggle?.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute("aria-expanded", String(!panel.hidden));
    if (!panel.hidden) panel.querySelector("input").focus();
  });
  document.getElementById("search-close")?.addEventListener("click", () => {
    closeSearch();
    toggle?.focus();
  });
  if (new URLSearchParams(location.search).get("search") && panel) {
    panel.hidden = false;
    toggle?.setAttribute("aria-expanded", "true");
  }
  const dialog = document.querySelector(".cart-drawer");
  if (dialog) {
    dialog.setAttribute("tabindex", "-1");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", "Your shopping bag");
  }
  let previousFocus;
  document.querySelectorAll(".open-cart-drawer").forEach((button) =>
    button.addEventListener("click", () => {
      previousFocus = button;
      document.querySelector(".cart-drawer")?.focus();
    }),
  );
  document.querySelectorAll(".maison-nav a").forEach((link) => {
    if (
      location.pathname + location.search ===
      new URL(link.href).pathname + new URL(link.href).search
    )
      link.setAttribute("aria-current", "page");
  });
  document.addEventListener("keydown", (e) => {
    const overlay = document.getElementById("cart-drawer-overlay");
    if (e.key === "Escape") {
      closeSearch();
      document.getElementById("mobile-nav-menu")?.classList.remove("active");
      document
        .getElementById("mobile-menu-toggle")
        ?.setAttribute("aria-expanded", "false");
      if (overlay?.classList.contains("active")) {
        overlay.classList.remove("active");
        previousFocus?.focus();
      }
    }
    if (e.key === "Tab" && overlay?.classList.contains("active")) {
      const items = [
        ...overlay.querySelectorAll(
          'a[href],button:not([disabled]),[tabindex="0"]',
        ),
      ];
      const first = items[0],
        last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
  });
  document
    .getElementById("close-cart-drawer")
    ?.addEventListener("click", () => previousFocus?.focus());
});

document.addEventListener("keydown", (event) => {
  if (
    (event.key === "Enter" || event.key === " ") &&
    event.target.matches(".filter-item")
  ) {
    event.preventDefault();
    event.target.click();
  }
});

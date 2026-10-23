// Global Application State Store & UI Helpers

const State = {
  user: null,
  cart: { items: [], subtotal: 0, totalItems: 0 },
  wishlist: [],
  listeners: [],

  subscribe(listener) {
    this.listeners.push(listener);
  },

  notify() {
    this.listeners.forEach((fn) => fn(this));
  },

  async init() {
    let token;
    try {
      const auth = window.FirebaseSession
        ? await window.FirebaseSession.ready()
        : null;
      token = auth ? await window.FirebaseSession.token() : getAuthToken();
      if (auth) setAuthToken(null);
    } catch (error) {
      console.warn(error.message);
      return;
    }

    if (token) {
      try {
        const res = await api.getMe();
        if (res.success) {
          this.user = res.user;
          // Load wishlist
          try {
            const wRes = await api.getWishlist();
            if (wRes.success) this.wishlist = wRes.data;
          } catch (e) {}
        }
      } catch (err) {
        setAuthToken(null);
        this.user = null;
      }
    }

    // Load Cart
    try {
      const cRes = await api.getCart();
      if (cRes.success) {
        this.cart = cRes.data;
      }
    } catch (err) {
      console.warn("Could not load cart:", err);
    }

    this.notify();
  },

  setUser(user, token) {
    this.user = user;
    if (token) setAuthToken(token);
    this.notify();
  },

  async logout() {
    if (window.FirebaseSession) await window.FirebaseSession.logout();
    this.user = null;
    this.wishlist = [];
    setAuthToken(null);
    this.notify();
    window.location.href = "/login.html";
  },

  setCart(cartData) {
    this.cart = cartData;
    this.notify();
  },

  async refreshCart() {
    try {
      const res = await api.getCart();
      if (res.success) {
        this.setCart(res.data);
      }
    } catch (e) {}
  },

  async refreshWishlist() {
    if (!this.user) return;
    try {
      const res = await api.getWishlist();
      if (res.success) {
        this.wishlist = res.data;
        this.notify();
      }
    } catch (e) {}
  },
};

// Toast notification helper
function showToast(message, type = "info", duration = 3500) {
  let container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  const icon =
    type === "success"
      ? "fa-circle-check"
      : type === "danger"
        ? "fa-circle-xmark"
        : type === "warning"
          ? "fa-triangle-exclamation"
          : "fa-circle-info";

  toast.innerHTML = `
    <i class="fa-solid ${icon}"></i>
    <div>${message}</div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(100%)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Format Currency in Indian Rupees (INR)
function formatCurrency(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

// Render Star Ratings
function renderStars(rating, count = null) {
  const rounded = Math.round((rating || 0) * 2) / 2;
  let starsHtml = "";

  for (let i = 1; i <= 5; i++) {
    if (i <= rounded) {
      starsHtml += '<i class="fa-solid fa-star"></i>';
    } else if (i - 0.5 === rounded) {
      starsHtml += '<i class="fa-solid fa-star-half-stroke"></i>';
    } else {
      starsHtml += '<i class="fa-solid fa-star star-empty"></i>';
    }
  }

  return `
    <div class="rating-stars">
      ${starsHtml}
      ${count !== null ? `<span class="rating-count">(${count})</span>` : ""}
    </div>
  `;
}

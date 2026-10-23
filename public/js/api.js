// KICKSZN API Client Module
const API_BASE = "/api";

function getSessionToken() {
  let token =
    localStorage.getItem("kickszn_session_token") ||
    localStorage.getItem("nexus_session_token");
  if (!token) {
    token = "sess_" + crypto.randomUUID();
    localStorage.setItem("kickszn_session_token", token);
  }
  return token;
}

function getAuthToken() {
  return (
    localStorage.getItem("kickszn_auth_token") ||
    localStorage.getItem("nexus_auth_token")
  );
}

function setAuthToken(token) {
  if (token) {
    localStorage.setItem("kickszn_auth_token", token);
    localStorage.setItem("nexus_auth_token", token);
  } else {
    localStorage.removeItem("kickszn_auth_token");
    localStorage.removeItem("nexus_auth_token");
  }
}

async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    "Content-Type": "application/json",
    "x-session-token": getSessionToken(),
    ...(options.headers || {}),
  };

  const firebaseAuth = window.FirebaseSession
    ? await window.FirebaseSession.ready()
    : null;
  const authToken = firebaseAuth
    ? await window.FirebaseSession.token()
    : getAuthToken();
  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const config = {
    ...options,
    headers,
  };

  if (options.body && typeof options.body === "object") {
    config.body = JSON.stringify(options.body);
  }

  try {
    const response = await fetch(url, config);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(data.message || `HTTP error ${response.status}`);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  } catch (err) {
    console.error(`API Error [${endpoint}]:`, err);
    throw err;
  }
}

const api = {
  // Auth
  login: async (email, password) => {
    const session = window.FirebaseSession
      ? await window.FirebaseSession.login(email, password)
      : null;
    if (!session)
      return apiRequest("/auth/login", {
        method: "POST",
        body: { email, password },
      });
    const result = await apiRequest("/auth/me");
    return result;
  },
  register: async (userData) => {
    const session = window.FirebaseSession
      ? await window.FirebaseSession.register(userData)
      : null;
    if (!session)
      return apiRequest("/auth/register", { method: "POST", body: userData });
    const result = await apiRequest("/auth/sync", {
      method: "POST",
      body: { full_name: userData.full_name, phone: userData.phone || "" },
    });
    return result;
  },
  getMe: () => apiRequest("/auth/me"),

  // Products
  getProducts: (params = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") query.append(k, v);
    });
    return apiRequest(`/products?${query.toString()}`);
  },
  getProduct: (idOrSlug) => apiRequest(`/products/${idOrSlug}`),
  getFeaturedProducts: () => apiRequest("/products/featured"),
  getRelatedProducts: (id) => apiRequest(`/products/related/${id}`),

  // Categories
  getCategories: () => apiRequest("/categories"),

  // Cart
  getCart: () => apiRequest("/cart"),
  addToCart: (productId, quantity = 1, variantId = null) =>
    apiRequest("/cart/add", {
      method: "POST",
      body: {
        product_id: productId,
        productId: productId,
        quantity: parseInt(quantity, 10) || 1,
        variant_id: variantId,
        variantId: variantId,
      },
    }),
  updateCartItem: (itemId, quantity) =>
    apiRequest(`/cart/items/${itemId}`, {
      method: "PUT",
      body: { quantity: parseInt(quantity, 10) },
    }),
  removeCartItem: (itemId) =>
    apiRequest(`/cart/items/${itemId}`, { method: "DELETE" }),
  clearCart: () => apiRequest("/cart/clear", { method: "DELETE" }),
  mergeCart: () =>
    apiRequest("/cart/merge", {
      method: "POST",
      body: { session_token: getSessionToken() },
    }),

  // Wishlist
  getWishlist: () => apiRequest("/wishlist"),
  addToWishlist: (productId) =>
    apiRequest("/wishlist", {
      method: "POST",
      body: { product_id: productId, productId: productId },
    }),
  removeFromWishlist: (productId) =>
    apiRequest(`/wishlist/${productId}`, { method: "DELETE" }),
  checkWishlist: (productId) => apiRequest(`/wishlist/check/${productId}`),

  // Coupons
  validateCoupon: (code, cartSubtotal) =>
    apiRequest("/coupons/validate", {
      method: "POST",
      body: { code, cart_subtotal: cartSubtotal },
    }),

  // Orders
  checkout: (orderData) =>
    apiRequest("/orders/checkout", { method: "POST", body: orderData }),
  getMyOrders: () => apiRequest("/orders/my-orders"),
  getOrderDetail: (idOrNumber) => apiRequest(`/orders/${idOrNumber}`),

  // User Profile & Addresses
  updateProfile: (profileData) =>
    apiRequest("/users/profile", { method: "PUT", body: profileData }),
  changePassword: async (current_password, new_password) => {
    const auth = window.FirebaseSession
      ? await window.FirebaseSession.ready()
      : null;
    return auth
      ? window.FirebaseSession.password(current_password, new_password)
      : apiRequest("/users/change-password", {
          method: "PUT",
          body: { current_password, new_password },
        });
  },
  getAddresses: () => apiRequest("/users/addresses"),
  createAddress: (addressData) =>
    apiRequest("/users/addresses", { method: "POST", body: addressData }),
  updateAddress: (id, addressData) =>
    apiRequest(`/users/addresses/${id}`, { method: "PUT", body: addressData }),
  deleteAddress: (id) =>
    apiRequest(`/users/addresses/${id}`, { method: "DELETE" }),

  // Reviews
  getProductReviews: (productId) => apiRequest(`/reviews/product/${productId}`),
  createReview: (reviewData) =>
    apiRequest("/reviews", { method: "POST", body: reviewData }),
  voteHelpful: (reviewId) =>
    apiRequest(`/reviews/${reviewId}/helpful`, { method: "POST" }),

  // Contact & Newsletter
  submitContact: (messageData) =>
    apiRequest("/contact", { method: "POST", body: messageData }),
  subscribeNewsletter: (email) =>
    apiRequest("/newsletter", { method: "POST", body: { email } }),
};

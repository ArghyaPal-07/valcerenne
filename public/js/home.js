// Valcerenne editorial homepage. Product and category records come from the existing API.
let selectedProducts = [];
let arrivalsProducts = [];
let activeSelection = "edit";
document.addEventListener("DOMContentLoaded", async () => {
  await Promise.all([loadEditorialCategories(), loadSelection()]);
  State.subscribe(() => renderSelection());
});
const CATEGORY_EDITORIAL = {
  "womens-fashion": {
    title: "For her",
    note: "An effortless point of view",
    image: "photo-1539533018447-63fcce2678e3",
  },
  "mens-fashion": {
    title: "For him",
    note: "A study in modern classics",
    image: "photo-1617137968427-85924c800a22",
  },
  accessories: {
    title: "The finishing touches",
    note: "Details make the difference",
    image: "photo-1553062407-98eeb64c6a62",
  },
  "home-living": {
    title: "The art of living",
    note: "Objects for a thoughtful home",
    image: "photo-1600210492486-724fe5c67fb0",
  },
};
async function loadEditorialCategories() {
  const container = document.getElementById("featured-categories-grid");
  try {
    const res = await api.getCategories();
    if (!res.success || !res.data.length) throw new Error("empty");
    const all = res.data;
    let chosen = Object.keys(CATEGORY_EDITORIAL)
      .map((slug) => all.find((c) => c.slug === slug))
      .filter(Boolean);
    if (!chosen.length) chosen = all.slice(0, 4);
    container.innerHTML = chosen
      .map((cat) => {
        const c = CATEGORY_EDITORIAL[cat.slug];
        return `<a class="collection-card" href="/shop.html?category=${encodeURIComponent(cat.slug)}"><div class="collection-photo"><img src="${c ? "https://images.unsplash.com/" + c.image + "?auto=format&fit=crop&w=700&q=85" : cat.image_url}" alt="${escapeHTML(cat.name)} editorial" loading="lazy" onerror="this.onerror=null;this.src='/assets/image-unavailable.svg'"></div><div class="collection-caption"><div><h3>${escapeHTML(c?.title || cat.name)}</h3><small>${escapeHTML(c?.note || "Discover the collection")}</small></div><span aria-hidden="true">↗</span></div></a>`;
      })
      .join("");
  } catch (e) {
    container.innerHTML =
      '<p>The collection is temporarily unavailable. <a href="/shop.html">Try the catalogue →</a></p>';
  }
}
async function loadSelection() {
  try {
    const res = await api.getProducts({ limit: 40, sort: "featured" });
    if (!res.success) throw new Error("unavailable");
    const priority = [
      "double-breasted-wool-trench",
      "voyager-leather-duffel-bag",
      "classic-tailored-wool-blazer",
      "lumina-nordic-arc-lamp",
    ];
    selectedProducts = [...res.data]
      .sort(
        (a, b) =>
          (priority.indexOf(a.slug) < 0 ? 99 : priority.indexOf(a.slug)) -
          (priority.indexOf(b.slug) < 0 ? 99 : priority.indexOf(b.slug)),
      )
      .slice(0, 4);
    arrivalsProducts = res.data.filter((product) => product.is_new).slice(0, 4);
    renderSelection();
  } catch (e) {
    document.getElementById("featured-products-grid").innerHTML =
      "<p>Selected pieces are temporarily unavailable. Please try again shortly.</p>";
  }
}
function renderSelection() {
  const grid = document.getElementById("featured-products-grid");
  if (grid)
    grid.innerHTML = (activeSelection === "new"
      ? arrivalsProducts
      : selectedProducts
    ).length
      ? (activeSelection === "new" ? arrivalsProducts : selectedProducts)
          .map(renderProductCard)
          .join("")
      : "<p>No selected pieces are currently available.</p>";
}
function getSafeFallbackImage() {
  return "/assets/image-unavailable.svg";
}

function renderProductCard(p) {
  const inWishlist =
    State.wishlist &&
    State.wishlist.some((w) => w.id === p.id || w.product_id === p.id);
  const fallback = getSafeFallbackImage(p.category_name);

  return `
    <div class="product-card">
      <div class="product-thumb">
        <a class="product-image-link" href="/product.html?id=${p.slug}" aria-label="View ${escapeHTML(p.title)}"><img src="${p.primary_image || fallback}" alt="${p.title}" loading="lazy" onerror="this.onerror=null; this.src='/assets/image-unavailable.svg';"></a>
        <div class="product-badges">
          ${p.is_new ? '<span class="badge badge-success">New</span>' : ""}
          ${p.compare_price && p.compare_price > p.price ? `<span class="badge badge-danger">-${Math.round((1 - p.price / p.compare_price) * 100)}%</span>` : ""}
        </div>
        <div class="product-actions" style="opacity: 1; transform: none;">
          <button class="product-action-btn ${inWishlist ? "active" : ""}" onclick="handleToggleWishlist(${p.id}, event)" title="${inWishlist ? "Remove from Favourites" : "Add to Favourites"}">
            <i class="fa-${inWishlist ? "solid text-danger" : "regular"} fa-heart"></i>
          </button>
          <a href="/product.html?id=${p.slug}" class="product-action-btn" title="View Details">
            <i class="fa-solid fa-eye"></i>
          </a>
        </div>
      </div>
      <div class="product-content">
        <div class="product-category">${p.category_name || "Drops"}</div>
        <h3 class="product-title">
          <a href="/product.html?id=${p.slug}">${p.title}</a>
        </h3>
        <div class="product-meta">
          <div class="product-price-wrapper">
            <span class="product-price">${formatCurrency(p.price)}</span>
            ${p.compare_price ? `<span class="product-compare-price">${formatCurrency(p.compare_price)}</span>` : ""}
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
}

async function handleQuickAddToCart(productId, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  try {
    const res = await api.addToCart(productId, 1);
    if (res.success) {
      State.setCart(res.data);
      showToast("Added to cart ✓", "success");
    } else {
      showToast(res.message || "Unable to add product to cart.", "danger");
    }
  } catch (err) {
    showToast(err.message || "Unable to add product to cart.", "danger");
  }
}

async function handleToggleWishlist(productId, event) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  if (!State.user) {
    showToast("Please login to save favourites.", "warning");
    return;
  }

  const inWishlist =
    State.wishlist &&
    State.wishlist.some(
      (w) => w.id === productId || w.product_id === productId,
    );

  try {
    if (inWishlist) {
      await api.removeFromWishlist(productId);
      showToast("Removed from favourites", "info");
    } else {
      await api.addToWishlist(productId);
      showToast("Added to favourites ✓", "success");
    }
    await State.refreshWishlist();
  } catch (err) {
    showToast(err.message || "Wishlist action failed", "danger");
  }
}

function setSelection(value) {
  activeSelection = value;
  document
    .querySelectorAll("[data-selection]")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.selection === value),
      ),
    );
  renderSelection();
}

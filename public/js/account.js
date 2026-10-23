// Account, Profile & Address Book Controller

let editingAddressId = null;

document.addEventListener("DOMContentLoaded", async () => {
  await State.init();

  if (!State.user) {
    window.location.href = "/login.html";
    return;
  }

  renderAccountOverview();
  setupProfileForm();
  setupPasswordForm();
  setupAddressManagement();
});

function renderAccountOverview() {
  const user = State.user;

  const nameEls = document.querySelectorAll(".user-display-name");
  const emailEls = document.querySelectorAll(".user-display-email");
  const avatarEls = document.querySelectorAll(".user-display-avatar");

  nameEls.forEach((el) => (el.textContent = user.full_name));
  emailEls.forEach((el) => (el.textContent = user.email));
  avatarEls.forEach((el) => {
    if (user.avatar_url) {
      el.innerHTML = `<img src="${user.avatar_url}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
    } else {
      el.textContent = user.full_name.charAt(0).toUpperCase();
    }
  });

  // Pre-fill profile fields
  const nameInput = document.getElementById("profile-name");
  const phoneInput = document.getElementById("profile-phone");
  const emailInput = document.getElementById("profile-email");

  if (nameInput) nameInput.value = user.full_name;
  if (phoneInput && user.phone) phoneInput.value = user.phone;
  if (emailInput) emailInput.value = user.email;
}

function setupProfileForm() {
  const form = document.getElementById("profile-edit-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const full_name = document.getElementById("profile-name").value.trim();
    const phone = document.getElementById("profile-phone").value.trim();

    try {
      const res = await api.updateProfile({ full_name, phone });
      if (res.success) {
        State.setUser(res.user);
        showToast("Profile updated successfully!", "success");
        renderAccountOverview();
      }
    } catch (err) {
      showToast(err.message || "Failed to update profile", "danger");
    }
  });
}

function setupPasswordForm() {
  const form = document.getElementById("change-password-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const current = document.getElementById("current-pwd").value;
    const newPwd = document.getElementById("new-pwd").value;
    const confirmPwd = document.getElementById("confirm-pwd").value;

    if (newPwd !== confirmPwd) {
      showToast("New passwords do not match.", "danger");
      return;
    }

    try {
      const res = await api.changePassword(current, newPwd);
      if (res.success) {
        showToast("Password changed successfully!", "success");
        form.reset();
      }
    } catch (err) {
      showToast(err.message || "Failed to change password", "danger");
    }
  });
}

async function setupAddressManagement() {
  const container = document.getElementById("addresses-grid-container");
  if (!container) return;

  await loadAddressesList();

  const addBtn = document.getElementById("open-add-address-modal");
  const modal = document.getElementById("address-modal");
  const closeBtn = document.getElementById("close-address-modal");
  const form = document.getElementById("address-edit-form");

  if (addBtn && modal) {
    addBtn.addEventListener("click", () => {
      editingAddressId = null;
      if (form) form.reset();
      document.getElementById("address-modal-title").textContent =
        "Add New Address";
      modal.classList.add("active");
    });
  }

  if (closeBtn && modal) {
    closeBtn.addEventListener("click", () => modal.classList.remove("active"));
  }

  if (form) {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const addressData = {
        full_name: document.getElementById("addr-name").value.trim(),
        phone: document.getElementById("addr-phone").value.trim(),
        address_line1: document.getElementById("addr-line1").value.trim(),
        address_line2: document.getElementById("addr-line2").value.trim(),
        city: document.getElementById("addr-city").value.trim(),
        state: document.getElementById("addr-state").value.trim(),
        postal_code: document.getElementById("addr-zip").value.trim(),
        country:
          document.getElementById("addr-country").value.trim() ||
          "United States",
        is_default_shipping:
          document.getElementById("addr-default-ship").checked,
        is_default_billing:
          document.getElementById("addr-default-bill").checked,
      };

      try {
        if (editingAddressId) {
          await api.updateAddress(editingAddressId, addressData);
          showToast("Address updated!", "success");
        } else {
          await api.createAddress(addressData);
          showToast("Address added!", "success");
        }
        modal.classList.remove("active");
        await loadAddressesList();
      } catch (err) {
        showToast(err.message || "Failed to save address", "danger");
      }
    });
  }
}

async function loadAddressesList() {
  const container = document.getElementById("addresses-grid-container");
  if (!container) return;

  try {
    const res = await api.getAddresses();
    if (res.success) {
      const addresses = res.data;
      if (addresses.length === 0) {
        container.innerHTML = `<p style="color:var(--text-muted); grid-column:1/-1;">No saved addresses yet.</p>`;
        return;
      }

      window.savedAddressesForEditing = addresses;
      container.innerHTML = addresses
        .map(
          (addr) => `
        <div class="address-card ${addr.is_default_shipping ? "default" : ""}">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:0.75rem;">
            <div style="font-weight:700; font-size:1rem;">${escapeHTML(addr.full_name)}</div>
            <div>
              ${addr.is_default_shipping ? '<span class="badge badge-primary" style="margin-bottom:0.25rem;">Default Shipping</span>' : ""}
              ${addr.is_default_billing ? '<span class="badge badge-info">Default Billing</span>' : ""}
            </div>
          </div>
          <div style="font-size:0.875rem; color:var(--text-muted); line-height:1.6; margin-bottom:1.5rem; flex:1;">
            ${escapeHTML(addr.address_line1)} ${addr.address_line2 || ""}<br>
            ${escapeHTML(addr.city)}, ${escapeHTML(addr.state)} ${escapeHTML(addr.postal_code)}<br>
            ${escapeHTML(addr.country)}<br>
            Phone: ${escapeHTML(addr.phone)}
          </div>
          <div style="display:flex; gap:0.5rem; border-top:1px solid var(--border-light); padding-top:0.75rem;">
            <button class="btn btn-sm btn-outline" data-edit-address="${addr.id}">
              <i class="fa-solid fa-pen-to-square"></i> Edit
            </button>
            <button class="btn btn-sm btn-outline text-danger" onclick="deleteUserAddress(${addr.id})">
              <i class="fa-solid fa-trash"></i> Delete
            </button>
          </div>
        </div>
      `,
        )
        .join("");
    }
  } catch (err) {
    console.error("Failed to load addresses:", err);
  }
}

function openEditAddressModal(addr) {
  editingAddressId = addr.id;
  document.getElementById("address-modal-title").textContent = "Edit Address";
  document.getElementById("addr-name").value = addr.full_name;
  document.getElementById("addr-phone").value = addr.phone;
  document.getElementById("addr-line1").value = addr.address_line1;
  document.getElementById("addr-line2").value = addr.address_line2 || "";
  document.getElementById("addr-city").value = addr.city;
  document.getElementById("addr-state").value = addr.state;
  document.getElementById("addr-zip").value = addr.postal_code;
  document.getElementById("addr-country").value = addr.country;
  document.getElementById("addr-default-ship").checked =
    !!addr.is_default_shipping;
  document.getElementById("addr-default-bill").checked =
    !!addr.is_default_billing;

  document.getElementById("address-modal").classList.add("active");
}

async function deleteUserAddress(id) {
  if (!confirm("Are you sure you want to delete this address?")) return;
  try {
    const res = await api.deleteAddress(id);
    if (res.success) {
      showToast("Address deleted", "info");
      await loadAddressesList();
    }
  } catch (err) {
    showToast("Failed to delete address", "danger");
  }
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-edit-address]");
  if (button) {
    const address = (window.savedAddressesForEditing || []).find(
      (item) => String(item.id) === button.dataset.editAddress,
    );
    if (address) openEditAddressModal(address);
  }
});

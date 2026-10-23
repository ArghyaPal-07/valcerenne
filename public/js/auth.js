// Authentication Controller (Login & Registration)

document.addEventListener("DOMContentLoaded", () => {
  setupLoginForm();
  setupRegisterForm();
  document
    .getElementById("password-reset-button")
    ?.addEventListener("click", async () => {
      const email = document.getElementById("login-email").value.trim();
      if (!email)
        return showToast("Enter your email address first.", "warning");
      try {
        await window.FirebaseSession.reset(email);
        showToast(
          "If an eligible account exists, password-reset instructions will be sent.",
          "success",
        );
      } catch (error) {
        showToast(error.message, "danger");
      }
    });
});

function setupLoginForm() {
  const form = document.getElementById("login-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;

    const btn = form.querySelector('button[type="submit"]');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML =
        '<i class="fa-solid fa-spinner fa-spin"></i> Logging in...';
    }

    try {
      const res = await api.login(email, password);
      if (res.success) {
        State.setUser(res.user, res.token);

        // Merge guest cart items into account
        try {
          await api.mergeCart();
          await State.refreshCart();
        } catch (e) {}

        showToast(`Welcome back, ${res.user.full_name}!`, "success");

        // Check redirect
        const params = new URLSearchParams(window.location.search);
        const requested = params.get("redirect") || "/account.html";
        const redirect =
          requested.startsWith("/") && !requested.startsWith("//")
            ? requested
            : "/account.html";
        setTimeout(() => (window.location.href = redirect), 800);
      }
    } catch (err) {
      showToast(
        err.message || "Login failed. Please check your credentials.",
        "danger",
      );
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Sign In';
      }
    }
  });
}

function setupRegisterForm() {
  const form = document.getElementById("register-form");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const full_name = document.getElementById("reg-name").value.trim();
    const email = document.getElementById("reg-email").value.trim();
    const phone = document.getElementById("reg-phone")?.value.trim();
    const password = document.getElementById("reg-password").value;
    const confirm = document.getElementById("reg-confirm-password").value;

    if (password !== confirm) {
      showToast("Passwords do not match.", "danger");
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML =
        '<i class="fa-solid fa-spinner fa-spin"></i> Creating Account...';
    }

    try {
      const res = await api.register({ full_name, email, password, phone });
      if (res.success) {
        State.setUser(res.user, res.token);

        // Merge guest cart items into account
        try {
          await api.mergeCart();
          await State.refreshCart();
        } catch (e) {}

        showToast(
          "Account created successfully! Welcome to Valcerenne.",
          "success",
        );
        setTimeout(() => (window.location.href = "/account.html"), 800);
      }
    } catch (err) {
      showToast(err.message || "Registration failed.", "danger");
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Create Account';
      }
    }
  });
}

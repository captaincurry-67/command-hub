(async function () {
  // Already logged in? Skip straight to the roster.
  try {
    await apiFetch("/api/me");
    location.href = "chain-of-command.html";
    return;
  } catch {
    // not logged in, show the form
  }

  const form = document.getElementById("login-form");
  const message = document.getElementById("message");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    message.className = "auth-message";
    message.textContent = "";

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;

    try {
      await apiFetch("/api/login", { method: "POST", body: { username, password } });
      const params = new URLSearchParams(location.search);
      location.href = params.get("next") || "chain-of-command.html";
    } catch (err) {
      message.className = "auth-message auth-message--error";
      message.textContent = err.message;
    }
  });
})();

(async function () {
  const card = document.getElementById("setup-card");
  const form = document.getElementById("setup-form");
  const message = document.getElementById("message");

  try {
    const status = await apiFetch("/api/setup-status");
    if (!status.needsSetup) {
      form.remove();
      message.className = "auth-message auth-message--error";
      message.textContent = "Setup has already been completed. Head to the login page instead.";
      const link = document.createElement("p");
      link.className = "auth-links";
      link.innerHTML = '<a href="login.html">Go to Login</a>';
      card.appendChild(link);
      return;
    }
  } catch (err) {
    message.className = "auth-message auth-message--error";
    message.textContent = "Could not check setup status: " + err.message;
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    message.className = "auth-message";
    message.textContent = "";

    const username = document.getElementById("username").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    try {
      await apiFetch("/api/setup", { method: "POST", body: { username, email, password } });
      location.href = "chain-of-command.html";
    } catch (err) {
      message.className = "auth-message auth-message--error";
      message.textContent = err.message;
    }
  });
})();

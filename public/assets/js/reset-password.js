(function () {
  const params = new URLSearchParams(location.search);
  const token = params.get("token");
  const message = document.getElementById("message");

  function showMessage(text, kind) {
    message.className = `auth-message auth-message--${kind}`;
    message.textContent = text;
  }

  if (token) {
    document.getElementById("request-view").style.display = "none";
    document.getElementById("confirm-view").style.display = "block";
    document.getElementById("confirm-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const newPassword = document.getElementById("new-password").value;
      try {
        await apiFetch("/api/reset-password", { method: "POST", body: { token, newPassword } });
        document.getElementById("confirm-view").style.display = "none";
        showMessage("Password updated. You can log in now.", "success");
      } catch (err) {
        showMessage(err.message, "error");
      }
    });
  } else {
    document.getElementById("confirm-view").style.display = "none";
    document.getElementById("request-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("email").value.trim();
      try {
        const res = await apiFetch("/api/request-reset", { method: "POST", body: { email } });
        showMessage(res.message, "success");
      } catch (err) {
        showMessage(err.message, "error");
      }
    });
  }
})();

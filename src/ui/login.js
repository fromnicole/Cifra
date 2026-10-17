// ============================================================
// CIFRA
// Inicio de sesión, registro y recuperación de contraseña
// ============================================================

export function renderLogin(
  app,
  onLogin,
  onSignUp = null,
  onPasswordReset = null,
) {
  let mode = "login";

  // Renderiza el modo actual y enlaza sus eventos después de reemplazar el HTML.
  function render() {
    const isSignUp = mode === "signup";
    const isForgotPassword = mode === "forgot";

    const title = isSignUp
      ? "Empieza con Cifra."
      : isForgotPassword
        ? "Recupera tu cuenta."
        : "Bienvenido de nuevo.";

    const description = isSignUp
      ? "Crea tu cuenta para gestionar tus finanzas personales."
      : isForgotPassword
        ? "Ingresa tu correo y te enviaremos instrucciones para recuperar tu contraseña."
        : "Ingresa con el correo y la contraseña de tu cuenta.";

    // La plantilla mantiene los IDs consultados por los manejadores de eventos.
    app.innerHTML = `
      <main class="container">
        <header class="page-header">
          <p class="eyebrow">TUS FINANZAS PERSONALES</p>
          <h1 class="page-title">Cifra</h1>
          <p class="page-description">
            Organiza tus cuentas y movimientos en un solo lugar.
          </p>
        </header>

        <section class="welcome surface" aria-labelledby="login-title">
          <p class="eyebrow">
            ${
              isSignUp
                ? "CREAR CUENTA"
                : isForgotPassword
                  ? "RECUPERAR CONTRASEÑA"
                  : "INICIO DE SESIÓN"
            }
          </p>

          <h2 id="login-title">${title}</h2>
          <p id="login-description">${description}</p>

          <form id="login-form" class="movement-form">
            <label class="form-field">
              Correo electrónico
              <input
                type="email"
                name="email"
                autocomplete="email"
                placeholder="tu@correo.cl"
                maxlength="254"
                required
              />
            </label>

            ${
              isForgotPassword
                ? ""
                : `
                  <label class="form-field">
                    Contraseña
                    <input
                      type="password"
                      name="password"
                      autocomplete="${isSignUp ? "new-password" : "current-password"}"
                      minlength="8"
                      required
                    />
                  </label>
                `
            }

            ${
              isSignUp
                ? `
                  <label class="form-field">
                    Confirmar contraseña
                    <input
                      type="password"
                      name="confirmPassword"
                      autocomplete="new-password"
                      minlength="8"
                      required
                    />
                  </label>
                `
                : ""
            }

            <p class="form-error" id="login-error" role="alert" hidden></p>

            <p
              class="form-success"
              id="login-success"
              role="status"
              aria-live="polite"
              hidden
            ></p>

            ${
              !isSignUp && !isForgotPassword
                ? `
                  <button
                    class="button button-secondary"
                    type="button"
                    id="forgot-password-button"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                `
                : ""
            }

            <button class="button" type="submit" id="login-submit">
              ${
                isSignUp
                  ? "Crear cuenta"
                  : isForgotPassword
                    ? "Enviar instrucciones"
                    : "Iniciar sesión"
              }
            </button>
          </form>

          <p class="auth-switch">
            ${
              isForgotPassword
                ? "¿Recordaste tu contraseña?"
                : isSignUp
                  ? "¿Ya tienes una cuenta?"
                  : "¿Todavía no tienes una cuenta?"
            }

            <button
              class="button button-secondary"
              type="button"
              id="auth-mode-toggle"
            >
              ${
                isForgotPassword || isSignUp ? "Iniciar sesión" : "Crear cuenta"
              }
            </button>
          </p>
        </section>

        <footer class="page-footer">
          <p>Tu espacio personal.</p>
        </footer>
      </main>
    `;

    const form = app.querySelector("#login-form");
    const errorMessage = app.querySelector("#login-error");
    const successMessage = app.querySelector("#login-success");
    const submitButton = app.querySelector("#login-submit");
    const toggleButton = app.querySelector("#auth-mode-toggle");
    const forgotButton = app.querySelector("#forgot-password-button");

    toggleButton.addEventListener("click", () => {
      mode = "login";
      render();
    });

    forgotButton?.addEventListener("click", () => {
      mode = "forgot";
      render();
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();

      errorMessage.hidden = true;
      successMessage.hidden = true;

      const formData = new FormData(form);
      const email = String(formData.get("email") || "").trim();
      const password = String(formData.get("password") || "");
      const confirmPassword = String(formData.get("confirmPassword") || "");

      if (isSignUp && password !== confirmPassword) {
        errorMessage.textContent = "Las contraseñas no coinciden.";
        errorMessage.hidden = false;
        return;
      }

      const callback = isForgotPassword
        ? onPasswordReset
        : isSignUp
          ? onSignUp
          : onLogin;

      if (typeof callback !== "function") {
        errorMessage.textContent = "Esta función todavía no está conectada.";
        errorMessage.hidden = false;
        return;
      }

      submitButton.disabled = true;
      toggleButton.disabled = true;

      if (forgotButton) {
        forgotButton.disabled = true;
      }

      submitButton.textContent = isForgotPassword
        ? "Enviando…"
        : isSignUp
          ? "Creando cuenta…"
          : "Iniciando sesión…";

      try {
        const result = isForgotPassword
          ? await callback({ email })
          : await callback({ email, password });

        if (result?.error) {
          errorMessage.textContent = result.error;
          errorMessage.hidden = false;
        } else if (result?.message) {
          successMessage.textContent = result.message;
          successMessage.hidden = false;
        }
      } catch (error) {
        console.error("Error de autenticación:", error);

        errorMessage.textContent =
          "No se pudo completar la solicitud. Revisa tu conexión e inténtalo de nuevo.";
        errorMessage.hidden = false;
      } finally {
        if (app.contains(form)) {
          submitButton.disabled = false;
          toggleButton.disabled = false;

          if (forgotButton) {
            forgotButton.disabled = false;
          }

          submitButton.textContent = isForgotPassword
            ? "Enviar instrucciones"
            : isSignUp
              ? "Crear cuenta"
              : "Iniciar sesión";
        }
      }
    });
  }

  render();
}

// ============================================================
// ACTUALIZACIÓN DE CONTRASEÑA
// ============================================================

// Pantalla para establecer una contraseña nueva desde el enlace del correo.
export function renderPasswordUpdate(app, onPasswordUpdate) {
  // Formulario de actualización desde el enlace de recuperación.
  app.innerHTML = `
    <main class="container">
      <header class="page-header">
        <p class="eyebrow">TUS FINANZAS PERSONALES</p>
        <h1 class="page-title">Cifra</h1>
        <p class="page-description">
          Elige una contraseña nueva para tu cuenta.
        </p>
      </header>

      <section class="welcome surface" aria-labelledby="password-title">
        <p class="eyebrow">SEGURIDAD DE LA CUENTA</p>
        <h2 id="password-title">Nueva contraseña.</h2>

        <form id="password-update-form" class="movement-form">
          <label class="form-field">
            Nueva contraseña
            <input
              type="password"
              name="password"
              autocomplete="new-password"
              minlength="8"
              required
            />
          </label>

          <label class="form-field">
            Confirmar contraseña
            <input
              type="password"
              name="confirmPassword"
              autocomplete="new-password"
              minlength="8"
              required
            />
          </label>

          <p class="form-error" id="password-error" role="alert" hidden></p>

          <p
            class="form-success"
            id="password-success"
            role="status"
            aria-live="polite"
            hidden
          ></p>

          <button class="button" type="submit" id="password-submit">
            Cambiar contraseña
          </button>
        </form>
      </section>

      <footer class="page-footer">
        <p>Tu espacio personal.</p>
      </footer>
    </main>
  `;

  const form = app.querySelector("#password-update-form");
  const errorMessage = app.querySelector("#password-error");
  const successMessage = app.querySelector("#password-success");
  const submitButton = app.querySelector("#password-submit");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    errorMessage.hidden = true;
    successMessage.hidden = true;

    const formData = new FormData(form);
    const password = String(formData.get("password") || "");
    const confirmPassword = String(formData.get("confirmPassword") || "");

    if (password !== confirmPassword) {
      errorMessage.textContent = "Las contraseñas no coinciden.";
      errorMessage.hidden = false;
      return;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Guardando…";

    try {
      const result = await onPasswordUpdate({ password });

      if (result?.error) {
        errorMessage.textContent = result.error;
        errorMessage.hidden = false;
      } else if (result?.message) {
        successMessage.textContent = result.message;
        successMessage.hidden = false;
      }
    } catch (error) {
      console.error("Error al cambiar contraseña:", error);

      errorMessage.textContent =
        "No se pudo cambiar la contraseña. Inténtalo de nuevo.";
      errorMessage.hidden = false;
    } finally {
      if (app.contains(form)) {
        submitButton.disabled = false;
        submitButton.textContent = "Cambiar contraseña";
      }
    }
  });
}

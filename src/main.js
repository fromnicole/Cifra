// ============================================================
// CIFRA
// Finanzas personales · HTML, CSS, JavaScript y Supabase
// ============================================================

// Estilos
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/app.css";

// Servicios y conexión con Supabase
import { supabase } from "./lib/supabase.js";
import { generateCurrentMonthBills } from "./services/recurrences.js";

// Utilidades financieras y de movimientos
import { updateFinancialTotals } from "./utils/financial.js";

// Notificaciones emergentes
import { notify } from "./ui/notifications.js";

// Componentes de interfaz
import {
  renderMovements,
  renderBills,
  renderPaidBills,
  renderRecurrences,
} from "./ui/dashboard.js";
import { renderLogin, renderPasswordUpdate } from "./ui/login.js";

// Funcionalidades
import { setupMovementFeature, mapMovement } from "./features/movements.js";
import { setupRecurrencesFeature } from "./features/recurrences.js";
import { setupBillsFeature, normalizeBill } from "./features/bills.js";

// Formateo, fechas y validaciones
import {
  toDateInput,
  formatDate,
  parseChileanDate,
  isValidIsoDate,
  escapeHtml,
  getCurrentMonthLabel,
} from "./utils/formatters.js";

// ============================================================
// CONFIGURACIÓN Y ESTADO
// ============================================================

const app = document.querySelector("#app");

const money = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

const financial = {
  balance: 0,
  income: 0,
  expenses: 0,
  availableAfterBills: 0,
};

// Datos cargados desde Supabase durante la sesión actual.
let movements = [];
let bills = [];
let recurrences = [];
let currentView = "inicio";

// Filtros de la lista de movimientos.
const movementFilters = {
  search: "",
  type: "",
  category: "",
  from: "",
  to: "",
};

let movementFiltersOpen = false;

const paidBillFilters = {
  search: "",
  category: "",
  from: "",
  to: "",
};

let paidBillFiltersOpen = false;

// ============================================================
// FILTRADO DE DATOS
// ============================================================

function getFilteredPaidBills() {
  const search = paidBillFilters.search.trim().toLocaleLowerCase("es-CL");

  return bills.filter((bill) => {
    if (!bill.is_paid) return false;

    const name = String(bill.name || "").toLocaleLowerCase("es-CL");

    const paidDate = String(bill.paid_at?.slice(0, 10) || bill.due_date || "");

    const matchesSearch = !search || name.includes(search);

    const matchesFrom =
      !paidBillFilters.from || paidDate >= paidBillFilters.from;

    const matchesTo = !paidBillFilters.to || paidDate <= paidBillFilters.to;

    return matchesSearch && matchesFrom && matchesTo;
  });
}

function getFilteredMovements() {
  const search = movementFilters.search.trim().toLocaleLowerCase("es-CL");

  return movements.filter((movement) => {
    const description = String(movement.description || "").toLocaleLowerCase(
      "es-CL",
    );

    const category = String(movement.category || "").toLocaleLowerCase("es-CL");

    const matchesSearch =
      !search || description.includes(search) || category.includes(search);

    const matchesType =
      !movementFilters.type || movement.type === movementFilters.type;

    const matchesCategory =
      !movementFilters.category ||
      movement.category === movementFilters.category;

    const matchesFrom =
      !movementFilters.from || movement.date >= movementFilters.from;

    const matchesTo =
      !movementFilters.to || movement.date <= movementFilters.to;

    return (
      matchesSearch &&
      matchesType &&
      matchesCategory &&
      matchesFrom &&
      matchesTo
    );
  });
}

// ============================================================
// CARGA DE DATOS Y AUTENTICACIÓN
// ============================================================

// Obtiene los datos de Supabase y muestra el panel principal.
// Si no existe una sesión válida, vuelve al inicio de sesión.
async function loadAndRenderDashboard() {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    renderLogin(app, handleLogin, handleSignUp, handlePasswordReset);
    return;
  }

  const userId = userData.user.id;

  // Prepara los vencimientos antes de cargar las cuentas.
  try {
    await generateCurrentMonthBills(userId);
  } catch (error) {
    console.error("Error al preparar las cuentas:", error);

    alert(error.message || "No se pudieron preparar las cuentas recurrentes.");

    return;
  }

  // Carga los movimientos ordenados por fecha y creación.
  const { data: movementData, error: movementError } = await supabase
    .from("movements")
    .select(
      "id, description, category, amount, type, date, created_at, bill_id, attachment_path, attachment_name",
    )
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (movementError) {
    console.error("Error al cargar movimientos:", movementError);

    alert("No se pudieron cargar los movimientos. Inténtalo de nuevo.");

    return;
  }

  // Carga las recurrencias ordenadas por nombre.
  const { data: recurrenceData, error: recurrenceError } = await supabase
    .from("bill_recurrences")
    .select(
      "id, name, category, due_day, start_date, end_date, amount_mode, amount, is_active, created_at, updated_at",
    )
    .order("name", { ascending: true });

  if (recurrenceError) {
    console.error("Error al cargar recurrencias:", recurrenceError);

    alert("No se pudieron cargar las recurrencias.");

    return;
  }

  // Carga las cuentas manuales y los vencimientos recurrentes.
  const { data: billData, error: billError } = await supabase
    .from("bills")
    .select(
      "id, name, category, amount, due_date, is_paid, recurrence_id, paid_at, created_at, attachment_path, attachment_name",
    )
    .order("due_date", { ascending: true });

  if (billError) {
    console.error("Error al cargar cuentas:", billError);

    alert("No se pudieron cargar las cuentas pendientes. Inténtalo de nuevo.");

    return;
  }

  // Normaliza los datos para mantener los importes como números.
  movements = movementData.map(mapMovement);

  recurrences = recurrenceData.map((recurrence) => ({
    ...recurrence,
    amount: Number(recurrence.amount),
  }));

  bills = billData.map(normalizeBill);

  updateFinancialTotals(movements, financial, bills);
  renderDashboard();
}

async function refreshBillsAndMovements() {
  const [movementResult, billResult] = await Promise.all([
    supabase
      .from("movements")
      .select(
        "id, description, category, amount, type, date, created_at, bill_id, attachment_path, attachment_name",
      )
      .order("date", { ascending: false })
      .order("created_at", { ascending: false }),

    supabase
      .from("bills")
      .select(
        "id, name, category, amount, due_date, is_paid, recurrence_id, paid_at, created_at, attachment_path, attachment_name",
      )
      .order("due_date", { ascending: true }),
  ]);

  if (movementResult.error) {
    throw movementResult.error;
  }

  if (billResult.error) {
    throw billResult.error;
  }

  movements = movementResult.data.map(mapMovement);
  bills = billResult.data.map(normalizeBill);

  renderDashboard();
}

async function handleLogin({ email, password }) {
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error("Error al iniciar sesión:", error);

    return {
      error: "Correo o contraseña incorrectos.",
    };
  }

  await loadAndRenderDashboard();
  return null;
}

async function handleSignUp({ email, password }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    console.error("Error al crear la cuenta:", error);

    return {
      error:
        "No se pudo crear la cuenta. Revisa los datos e inténtalo de nuevo.",
    };
  }

  // Si Supabase creó una sesión, podemos entrar directamente.
  if (data.session) {
    await loadAndRenderDashboard();
    return null;
  }

  // Si la confirmación por correo está activada, no habrá sesión todavía.
  return {
    message:
      "Cuenta creada. Revisa tu correo y confirma la dirección antes de iniciar sesión.",
  };
}

// Envía el correo para recuperar la contraseña.
async function handlePasswordReset({ email }) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });

  if (error) {
    console.error("Error al recuperar contraseña:", error);

    return {
      error: "No se pudo enviar el correo. Inténtalo de nuevo.",
    };
  }

  return {
    message:
      "Si la dirección está registrada, recibirás un correo con las instrucciones.",
  };
}

// Guarda la nueva contraseña elegida por el usuario.
async function handlePasswordUpdate({ password }) {
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    console.error("Error al cambiar contraseña:", error);

    return {
      error: "No se pudo cambiar la contraseña. Inténtalo de nuevo.",
    };
  }

  window.history.replaceState({}, document.title, window.location.pathname);

  await loadAndRenderDashboard();
  return null;
}

// ============================================================
// PANEL PRINCIPAL Y FORMULARIOS
// ============================================================

function renderDashboard() {
  // Actualiza los totales antes de construir la vista.

  updateFinancialTotals(movements, financial, bills);

  const viewContent = {
    inicio: {
      eyebrow: "INICIO",
      title: "Así van tus cuentas",
    },
    movimientos: {
      eyebrow: "MOVIMIENTOS",
      title: "Todos tus movimientos",
    },
    cuentas: {
      eyebrow: "CUENTAS PENDIENTES",
      title: "Pagos y vencimientos",
    },
  };

  const currentContent = viewContent[currentView];

  // Plantilla del panel: conserva los identificadores usados por los eventos y módulos.
  app.innerHTML = `
    <div class="dashboard">
      <aside class="sidebar" aria-label="Navegación principal">
        <a class="brand" href="#inicio" aria-label="Cifra, inicio">
          <img
            class="brand-mark"
            src="/cifra-icon.png"
            alt=""
            aria-hidden="true"
          />
          <span>Cifra</span>
        </a>

        <p class="sidebar-label">MENÚ</p>

        <nav class="sidebar-nav">
          <a
            class="nav-link is-active"
            href="#inicio"
            aria-current="page"
          >
            <span aria-hidden="true">
              <i data-lucide="layout-dashboard"></i>
            </span>
            Inicio
          </a>

          <a class="nav-link" href="#movimientos">
            <span aria-hidden="true">
              <i data-lucide="arrow-left-right"></i>
            </span>
            Movimientos
          </a>

          <a class="nav-link" href="#cuentas">
            <span aria-hidden="true">
              <i data-lucide="calendar-clock"></i>
            </span>
            Cuentas pendientes
          </a>
        </nav>

        <div class="sidebar-bottom">
          <p class="demo-label">Cuenta personal</p>
          <p class="profile-name">Cifra</p>

          <button
            class="button-secondary button"
            type="button"
            id="logout-button"
          >
            Cerrar sesión
          </button>

          <button
            class="button-secondary button"
            type="button"
            id="delete-account-button"
          >
            Eliminar mi cuenta
          </button>
        </div>
      </aside>

      <main
        class="dashboard-main"
        id="inicio"
        data-view="${currentView}"
      >
        <header class="dashboard-header">
          <div>
            <p class="eyebrow">${currentContent.eyebrow}</p>
            <h1 class="dashboard-title">${currentContent.title}</h1>
            <p class="dashboard-subtitle">${getCurrentMonthLabel()}</p>
          </div>

          <details class="mobile-account-menu" id="mobile-account-menu">
            <summary class="button button-secondary">
              <i data-lucide="user-round" aria-hidden="true"></i>
              <span>Cuenta</span>
            </summary>

            <div class="mobile-account-menu-panel">
              <button
                class="button button-secondary"
                type="button"
                data-account-action="logout"
              >
                Cerrar sesión
              </button>

              <button
                class="button button-secondary"
                type="button"
                data-account-action="delete"
              >
                Eliminar mi cuenta
              </button>
            </div>
          </details>

          <button class="button" type="button" id="add-movement">
            <i data-lucide="plus" aria-hidden="true"></i>
            Nuevo movimiento
          </button>
        </header>

        <p class="demo-notice" role="note">
          Tus movimientos se guardan en tu cuenta.
        </p>

        <section class="summary-grid" aria-label="Resumen financiero">
          <article class="balance-card">
            <p class="summary-label">Saldo disponible</p>

            <p class="balance-amount" id="balance-amount">
              ${money.format(financial.balance)}
            </p>

            <p class="balance-caption">Pesos chilenos · CLP</p>
          </article>

          <article class="summary-card">
            <span class="summary-icon income-icon" aria-hidden="true">
              <i data-lucide="trending-up"></i>
            </span>

            <p class="summary-label">Ingresos del mes</p>

            <p class="summary-amount" id="income-amount">
              ${money.format(financial.income)}
            </p>

            <p class="summary-caption">Dinero recibido</p>
          </article>

          <article class="summary-card">
            <span class="summary-icon expense-icon" aria-hidden="true">
              <i data-lucide="trending-down"></i>
            </span>

            <p class="summary-label">Gastos del mes</p>

            <p class="summary-amount" id="expenses-amount">
              ${money.format(financial.expenses)}
            </p>

            <p class="summary-caption">Pagos realizados</p>
          </article>
        </section>

        <div class="dashboard-columns">
          <section
            class="panel"
            id="movimientos"
            aria-labelledby="movements-title"
          >
            <div class="panel-heading">
              <div>
                <h2 id="movements-title">Movimientos recientes</h2>
                <p id="movement-count">
                  ${getFilteredMovements().length} de ${movements.length} movimientos
                </p>
              </div>
            </div>

            <div class="movement-search-bar">
              <label class="movement-search-input">
                <i data-lucide="search" aria-hidden="true"></i>
                <input
                  type="search"
                  id="movement-search"
                  placeholder="Buscar movimientos..."
                  aria-label="Buscar movimientos por descripción o categoría"
                  value="${escapeHtml(movementFilters.search)}"
                />
              </label>

              <button
                class="button button-secondary movement-filter-toggle"
                type="button"
                id="toggle-movement-filters"
                aria-expanded="${movementFiltersOpen}"
                aria-controls="movement-filters-advanced"
              >
                <i data-lucide="sliders-horizontal" aria-hidden="true"></i>
                Filtros
                ${(() => {
                  const activeFilters = [
                    movementFilters.type,
                    movementFilters.category,
                    movementFilters.from,
                    movementFilters.to,
                  ].filter(Boolean).length;

                  return activeFilters > 0
                    ? `<span id="movement-filter-badge" class="movement-filter-badge">${activeFilters}</span>`
                    : "";
                })()}
              </button>
            </div>

            <div
              class="movement-filters-advanced"
              id="movement-filters-advanced"
              ${movementFiltersOpen ? "" : "hidden"}
            >
              <label class="form-field">
                Tipo
                <select id="movement-type-filter">
                  <option value="">Todos</option>
                  <option value="expense" ${movementFilters.type === "expense" ? "selected" : ""}>Gastos</option>
                  <option value="income" ${movementFilters.type === "income" ? "selected" : ""}>Ingresos</option>
                </select>
              </label>

              <label class="form-field">
                Categoría
                <select id="movement-category-filter">
                  <option value="">Todas</option>
                  ${[
                    "Alimentación",
                    "Transporte",
                    "Hogar",
                    "Salud",
                    "Servicios",
                    "Sueldo",
                    "Otros",
                  ]
                    .map(
                      (category) => `
                        <option
                          value="${escapeHtml(category)}"
                          ${movementFilters.category === category ? "selected" : ""}
                        >
                          ${escapeHtml(category)}
                        </option>
                      `,
                    )
                    .join("")}
                </select>
              </label>

              <label class="form-field">
                Desde
                <input
                  type="date"
                  id="movement-date-from"
                  value="${movementFilters.from}"
                />
              </label>

              <label class="form-field">
                Hasta
                <input
                  type="date"
                  id="movement-date-to"
                  value="${movementFilters.to}"
                />
              </label>

              <button
                class="button button-secondary"
                type="button"
                id="clear-movement-filters"
              >
                Limpiar filtros
              </button>
            </div>

            <ul class="movement-list" id="movement-list">
              ${renderMovements(getFilteredMovements(), money)}
            </ul>
          </section>

          <section
            class="panel"
            id="cuentas"
            aria-labelledby="bills-title"
          >
            <div class="panel-heading">
              <div>
                <h2 id="bills-title">Cuentas pendientes</h2>
                <p>Pagos y vencimientos</p>
              </div>

              <div class="bills-heading-actions">
                <span class="count-badge">
                  ${bills.filter((bill) => !bill.is_paid).length} pendientes
                </span>

                <button class="button" type="button" id="add-bill">
                  Nueva cuenta
                </button>
              </div>
            </div>

            <ul class="bill-list">
              ${renderBills(bills, money)}
            </ul>
          </section>

          <section
            class="panel"
            id="historial-pagadas"
            aria-labelledby="paid-bills-title"
          >
            <div class="panel-heading">
              <div>
                <h2 id="paid-bills-title">Historial de cuentas pagadas</h2>
                <p id="paid-bill-count">
                  ${getFilteredPaidBills().length} cuentas pagadas
                </p>
              </div>

              <button
                type="button"
                id="delete-paid-history"
                class="button button-secondary"
              >
                Borrar todo el historial
              </button>
            </div>

            <div class="movement-search-bar">
              <label class="movement-search-input">
                <i data-lucide="search" aria-hidden="true"></i>
                <input
                  type="search"
                  id="paid-bill-search"
                  placeholder="Buscar cuentas pagadas..."
                  aria-label="Buscar cuentas pagadas por nombre o categoría"
                  value="${escapeHtml(paidBillFilters.search)}"
                />
              </label>

              <button
                class="button button-secondary movement-filter-toggle"
                type="button"
                id="toggle-paid-bill-filters"
                aria-expanded="${paidBillFiltersOpen}"
                aria-controls="paid-bill-filters-advanced"
              >
                <i data-lucide="sliders-horizontal" aria-hidden="true"></i>
                Filtros
              </button>
            </div>

            <div
              class="movement-filters-advanced"
              id="paid-bill-filters-advanced"
              ${paidBillFiltersOpen ? "" : "hidden"}
            >
              <label class="form-field">
                Desde
                <input
                  type="date"
                  id="paid-bill-date-from"
                  value="${paidBillFilters.from}"
                />
              </label>

              <label class="form-field">
                Hasta
                <input
                  type="date"
                  id="paid-bill-date-to"
                  value="${paidBillFilters.to}"
                />
              </label>

              <button
                class="button button-secondary"
                type="button"
                id="clear-paid-bill-filters"
              >
                Limpiar filtros
              </button>
            </div>

            <ul class="bill-list" id="paid-bills-list">
              ${renderPaidBills(getFilteredPaidBills(), money)}
            </ul>
          </section>

          <section
            class="panel"
            id="recurrencias"
            aria-labelledby="recurrences-title"
          >
            <div class="panel-heading">
              <div>
                <h2 id="recurrences-title">Recurrencias configuradas</h2>
                <p>Administra tus cuentas mensuales.</p>
              </div>

              <button class="button" type="button" id="add-recurrence">
                Nueva recurrencia
              </button>
            </div>

            <ul class="bill-list" id="recurrence-list">
              ${renderRecurrences(recurrences, money)}
            </ul>
          </section>
        </div>

        <footer class="dashboard-footer">
          Cifra · Tus movimientos están guardados en la nube.
        </footer>
      </main>

      <nav class="mobile-nav" aria-label="Navegación móvil">
        <a class="mobile-nav-link is-active" href="#inicio" aria-label="Inicio">
          <span aria-hidden="true">
            <i data-lucide="layout-dashboard"></i>
          </span>
          Inicio
        </a>

        <a
          class="mobile-nav-link"
          href="#movimientos"
          aria-label="Movimientos"
        >
          <span aria-hidden="true">
            <i data-lucide="arrow-left-right"></i>
          </span>
          Movimientos
        </a>

        <a
          class="mobile-nav-link"
          href="#cuentas"
          aria-label="Cuentas pendientes"
        >
          <span aria-hidden="true">
            <i data-lucide="calendar-clock"></i>
          </span>
          Cuentas
        </a>
      </nav>

      <!-- Formulario de movimientos -->
      <dialog
        class="movement-dialog"
        id="movement-dialog"
        aria-labelledby="form-title"
      >
        <form id="movement-form" class="movement-form">
          <input type="hidden" name="movementId" />

          <div class="form-heading">
            <div>
              <p class="eyebrow">REGISTRO</p>
              <h2 id="form-title">Nuevo movimiento</h2>
            </div>

            <button
              class="icon-button"
              type="button"
              id="close-form"
              aria-label="Cerrar formulario"
            >
              <i data-lucide="x"></i>
            </button>
          </div>

          <label class="form-field">
            Tipo de movimiento
            <select name="type" required>
              <option value="expense">Gasto</option>
              <option value="income">Ingreso</option>
            </select>
          </label>

          <label class="form-field">
            Descripción
            <input
              type="text"
              name="description"
              maxlength="80"
              placeholder="Ej. Compra del supermercado"
              required
            />
          </label>

          <label class="form-field">
            Categoría
            <select name="category" required>
              <option value="Alimentación">Alimentación</option>
              <option value="Transporte">Transporte</option>
              <option value="Hogar">Hogar</option>
              <option value="Salud">Salud</option>
              <option value="Servicios">Servicios</option>
              <option value="Sueldo">Sueldo</option>
              <option value="Otros">Otros</option>
            </select>
          </label>

          <label class="form-field">
            Importe en pesos chilenos
            <input
              type="text"
              name="amount"
              inputmode="numeric"
              maxlength="13"
              placeholder="Ej. 25.000"
              required
            />
          </label>

          <label class="form-field">
            Boleta o comprobante (opcional)
            <input
              type="file"
              id="movement-attachment"
              name="attachment"
              accept="image/jpeg,image/png,image/webp,application/pdf"
            />
            <span class="field-hint">
              Imagen o PDF, máximo 10 MB.
            </span>
            <p id="movement-attachment-current" class="field-hint" hidden></p>
            <button
              type="button"
              id="remove-movement-attachment"
              class="button-secondary button"
              hidden
            >
              Quitar comprobante
            </button>
          </label>

          <div class="form-field">
            <label for="movement-date">Fecha (DD/MM/AAAA)</label>

            <div
              style="
                display: flex;
                align-items: center;
                gap: 8px;
                position: relative;
              "
            >
              <input
                type="text"
                name="date"
                id="movement-date"
                placeholder="DD/MM/AAAA"
                value="${formatDate(toDateInput(new Date()))}"
                inputmode="numeric"
                maxlength="10"
                autocomplete="off"
                required
                style="flex: 1; min-width: 0;"
              />

              <button
                class="icon-button"
                type="button"
                id="open-date-picker"
                aria-label="Abrir calendario"
                title="Elegir fecha"
              >
                <i data-lucide="calendar-days" aria-hidden="true"></i>
              </button>

              <input
                type="date"
                id="date-picker-native"
                aria-label="Elegir fecha en el calendario"
                tabindex="-1"
                style="
                  position: absolute;
                  width: 1px;
                  height: 1px;
                  opacity: 0;
                  pointer-events: none;
                  left: 0;
                  bottom: 0;
                "
              />
            </div>
          </div>

          <p class="form-error" id="form-error" role="alert" hidden></p>

          <div class="form-actions">
            <button
              class="button-secondary button"
              type="button"
              id="cancel-form"
            >
              Cancelar
            </button>

            <button class="button" type="submit">
              Guardar movimiento
            </button>
          </div>
        </form>
      </dialog>

      <!-- Formulario de cuentas manuales -->
      <dialog
        class="movement-dialog"
        id="bill-dialog"
        aria-labelledby="bill-form-title"
      >
        <form id="bill-form" class="movement-form">
          <input type="hidden" name="billId" />

          <div class="form-heading">
            <div>
              <p class="eyebrow">CUENTAS</p>
              <h2 id="bill-form-title">Nueva cuenta</h2>
            </div>

            <button
              class="icon-button"
              type="button"
              id="close-bill-form"
              aria-label="Cerrar formulario"
            >
              <i data-lucide="x"></i>
            </button>
          </div>

          <label class="form-field">
            Nombre de la cuenta
            <input
              type="text"
              name="name"
              maxlength="80"
              placeholder="Ej. Arriendo"
              required
            />
          </label>

          <label class="form-field">
            Importe en pesos chilenos
            <input
              type="text"
              name="amount"
              inputmode="numeric"
              maxlength="13"
              placeholder="Ej. 25.000"
              required
            />
          </label>

          <label class="form-field">
            Fecha de vencimiento
            <div class="date-input-group">
              <input
                type="text"
                name="due_date"
                id="bill-due-date"
                placeholder="DD/MM/AAAA"
                inputmode="numeric"
                maxlength="10"
                autocomplete="off"
                required
              />
              <button
                class="icon-button"
                type="button"
                id="open-bill-date-picker"
                aria-label="Abrir calendario de vencimiento"
              >
                <i data-lucide="calendar-days" aria-hidden="true"></i>
              </button>
              <input
                type="date"
                id="bill-date-picker"
                aria-label="Elegir fecha de vencimiento"
                tabindex="-1"
                class="native-date-picker"
              />
            </div>
          </label>

          <div id="bill-attachment-field" hidden>
            <label class="form-field">
              Comprobante de pago (opcional)
              <input
                type="file"
                id="bill-attachment"
                name="attachment"
                accept="image/jpeg,image/png,image/webp,application/pdf"
              />
              <span class="field-hint">
                Imagen o PDF, máximo 10 MB.
              </span>
              <p id="bill-attachment-current" class="field-hint" hidden></p>
              <button
                type="button"
                id="remove-bill-attachment"
                class="button-secondary button"
                hidden
              >
                Quitar comprobante
              </button>
            </label>
          </div>

          <p class="form-error" id="bill-form-error" role="alert" hidden></p>

          <div class="form-actions">
            <button
              class="button-secondary button"
              type="button"
              id="cancel-bill-form"
            >
              Cancelar
            </button>

            <button class="button" type="submit">
              Guardar cuenta
            </button>
          </div>
        </form>
      </dialog>

      <!-- Formulario de recurrencias -->
      <dialog
        class="movement-dialog"
        id="recurrence-dialog"
        aria-labelledby="recurrence-form-title"
      >
        <form id="recurrence-form" class="movement-form">
          <input type="hidden" name="recurrenceId" />

          <div class="form-heading">
            <div>
              <p class="eyebrow">CUENTAS RECURRENTES</p>
              <h2 id="recurrence-form-title">Nueva recurrencia</h2>
            </div>

            <button
              class="icon-button"
              type="button"
              id="close-recurrence-form"
              aria-label="Cerrar formulario"
            >
              <i data-lucide="x"></i>
            </button>
          </div>

          <label class="form-field">
            Nombre de la cuenta
            <input
              type="text"
              name="name"
              maxlength="80"
              placeholder="Ej. Internet"
              required
            />
          </label>

          <label class="form-field">
            Categoría
            <select name="category" required>
              <option value="Alimentación">Alimentación</option>
              <option value="Transporte">Transporte</option>
              <option value="Hogar">Hogar</option>
              <option value="Salud">Salud</option>
              <option value="Servicios" selected>Servicios</option>
              <option value="Otros">Otros</option>
            </select>
          </label>

          <label class="form-field">
            Día de vencimiento de cada mes
            <input
              type="text"
              name="due_day"
              min="1"
              max="31"
              step="1"
              value="5"
              required
            />
            <span class="field-hint">
              Si el mes tiene menos días, se usará su último día.
            </span>
          </label>

          <label class="form-field">
            Importe
            <input
              type="text"
              name="amount"
              inputmode="numeric"
              maxlength="13"
              placeholder="Ej. 25.000"
              required
            />
          </label>

          <label class="form-field">
            Tipo de importe
            <select name="amount_mode" required>
              <option value="fixed">Fijo</option>
              <option value="variable">Variable</option>
            </select>
          </label>

          <p id="recurrence-amount-hint" class="bills-note">
            Se usará este importe para los nuevos vencimientos.
          </p>

          <label class="form-field">
            Fecha de inicio
            <div class="date-input-group">
              <input
                type="text"
                name="start_date"
                id="recurrence-start-date"
                placeholder="DD/MM/AAAA"
                inputmode="numeric"
                maxlength="10"
                autocomplete="off"
                required
              />
              <button
                class="icon-button"
                type="button"
                id="open-recurrence-start-picker"
                aria-label="Abrir calendario de inicio"
              >
                <i data-lucide="calendar-days" aria-hidden="true"></i>
              </button>
              <input
                type="date"
                id="recurrence-start-picker"
                aria-label="Elegir fecha de inicio"
                tabindex="-1"
                class="native-date-picker"
              />
            </div>
          </label>

          <label class="form-field">
            Fecha de término (opcional)
            <div class="date-input-group">
              <input
                type="text"
                name="end_date"
                id="recurrence-end-date"
                placeholder="DD/MM/AAAA"
                inputmode="numeric"
                maxlength="10"
                autocomplete="off"
              />
              <button
                class="icon-button"
                type="button"
                id="open-recurrence-end-picker"
                aria-label="Abrir calendario de término"
              >
                <i data-lucide="calendar-days" aria-hidden="true"></i>
              </button>
              <input
                type="date"
                id="recurrence-end-picker"
                aria-label="Elegir fecha de término"
                tabindex="-1"
                class="native-date-picker"
              />
            </div>
          </label>

          <p
            class="form-error"
            id="recurrence-form-error"
            role="alert"
            hidden
          ></p>

          <div class="form-actions">
            <button
              class="button-secondary button"
              type="button"
              id="cancel-recurrence-form"
            >
              Cancelar
            </button>

            <button class="button" type="submit">
              Guardar recurrencia
            </button>
          </div>
        </form>
      </dialog>

      <!-- Confirmación para eliminar la cuenta -->
      <dialog
        class="movement-dialog"
        id="delete-account-dialog"
        aria-labelledby="delete-account-title"
      >
        <form id="delete-account-form" class="movement-form">
          <div class="form-heading">
            <div>
              <p class="eyebrow">ELIMINAR CUENTA</p>
              <h2 id="delete-account-title">¿Estás segura?</h2>
            </div>

            <button
              class="icon-button"
              type="button"
              id="close-delete-account"
              aria-label="Cerrar"
            >
              <i data-lucide="x"></i>
            </button>
          </div>

          <p>
            Se eliminará tu cuenta y sus datos asociados.
            Esta acción no se puede deshacer.
          </p>

          <label class="form-field">
            Escribe ELIMINAR para confirmar
            <input
              id="delete-account-confirmation"
              type="text"
              autocomplete="off"
              required
            />
          </label>

          <p
            class="form-error"
            id="delete-account-error"
            role="alert"
            hidden
          ></p>

          <div class="form-actions">
            <button
              class="button-secondary button"
              type="button"
              id="cancel-delete-account"
            >
              Cancelar
            </button>

            <button
              class="button"
              type="submit"
              id="confirm-delete-account"
            >
              Eliminar mi cuenta
            </button>
          </div>
        </form>
      </dialog>
    </div>
  `;

  // Inicializa los iconos después de insertar el HTML.
  if (window.lucide) {
    window.lucide.createIcons();
  }

  // ============================================================
  // FILTROS DE MOVIMIENTOS
  // ============================================================

  const movementSearch = document.querySelector("#movement-search");
  const movementTypeFilter = document.querySelector("#movement-type-filter");
  const movementCategoryFilter = document.querySelector(
    "#movement-category-filter",
  );
  const movementDateFrom = document.querySelector("#movement-date-from");
  const movementDateTo = document.querySelector("#movement-date-to");
  const clearMovementFilters = document.querySelector(
    "#clear-movement-filters",
  );
  const toggleMovementFilters = document.querySelector(
    "#toggle-movement-filters",
  );
  const advancedMovementFilters = document.querySelector(
    "#movement-filters-advanced",
  );

  function updateMovementList() {
    const filteredMovements = getFilteredMovements();

    document.querySelector("#movement-list").innerHTML = renderMovements(
      filteredMovements,
      money,
    );

    document.querySelector("#movement-count").textContent =
      `${filteredMovements.length} de ${movements.length} movimientos`;

    const activeFilters = [
      movementFilters.type,
      movementFilters.category,
      movementFilters.from,
      movementFilters.to,
    ].filter(Boolean).length;

    const filterToggle = document.querySelector("#toggle-movement-filters");
    let filterBadge = document.querySelector("#movement-filter-badge");

    if (activeFilters > 0) {
      if (!filterBadge) {
        filterBadge = document.createElement("span");
        filterBadge.id = "movement-filter-badge";
        filterBadge.className = "movement-filter-badge";
        filterToggle.appendChild(filterBadge);
      }

      filterBadge.textContent = activeFilters;
    } else if (filterBadge) {
      filterBadge.remove();
    }

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  toggleMovementFilters.addEventListener("click", () => {
    movementFiltersOpen = !movementFiltersOpen;

    advancedMovementFilters.hidden = !movementFiltersOpen;

    toggleMovementFilters.setAttribute(
      "aria-expanded",
      String(movementFiltersOpen),
    );
  });

  movementSearch.addEventListener("input", () => {
    movementFilters.search = movementSearch.value;
    updateMovementList();
  });

  movementTypeFilter.addEventListener("change", () => {
    movementFilters.type = movementTypeFilter.value;
    updateMovementList();
  });

  movementCategoryFilter.addEventListener("change", () => {
    movementFilters.category = movementCategoryFilter.value;
    updateMovementList();
  });

  movementDateFrom.addEventListener("change", () => {
    movementFilters.from = movementDateFrom.value;
    updateMovementList();
  });

  movementDateTo.addEventListener("change", () => {
    movementFilters.to = movementDateTo.value;
    updateMovementList();
  });

  clearMovementFilters.addEventListener("click", () => {
    Object.assign(movementFilters, {
      search: "",
      type: "",
      category: "",
      from: "",
      to: "",
    });

    movementSearch.value = "";
    movementTypeFilter.value = "";
    movementCategoryFilter.value = "";
    movementDateFrom.value = "";
    movementDateTo.value = "";

    updateMovementList();
  });

  // ============================================================
  // REFERENCIAS A LOS ELEMENTOS DEL PANEL
  // ============================================================

  const dialog = document.querySelector("#movement-dialog");

  const billDialog = document.querySelector("#bill-dialog");
  const billForm = document.querySelector("#bill-form");
  const billError = document.querySelector("#bill-form-error");
  const billTitle = document.querySelector("#bill-form-title");
  const billSaveButton = billForm.querySelector('[type="submit"]');
  const billList = document.querySelector("#cuentas .bill-list");
  const paidBillsList = document.querySelector("#paid-bills-list");

  const paidBillSearch = document.querySelector("#paid-bill-search");
  const paidBillDateFrom = document.querySelector("#paid-bill-date-from");
  const paidBillDateTo = document.querySelector("#paid-bill-date-to");
  const clearPaidBillFilters = document.querySelector(
    "#clear-paid-bill-filters",
  );
  const togglePaidBillFilters = document.querySelector(
    "#toggle-paid-bill-filters",
  );
  const advancedPaidBillFilters = document.querySelector(
    "#paid-bill-filters-advanced",
  );

  function updatePaidBillsList() {
    const filteredBills = getFilteredPaidBills();
    const totalPaidBills = bills.filter((bill) => bill.is_paid).length;

    paidBillsList.innerHTML = renderPaidBills(filteredBills, money);

    document.querySelector("#paid-bill-count").textContent =
      `${filteredBills.length} de ${totalPaidBills} cuentas pagadas`;

    const activeFilters = [paidBillFilters.from, paidBillFilters.to].filter(
      Boolean,
    ).length;

    let filterBadge = document.querySelector("#paid-bill-filter-badge");

    if (activeFilters > 0) {
      if (!filterBadge) {
        filterBadge = document.createElement("span");
        filterBadge.id = "paid-bill-filter-badge";
        filterBadge.className = "movement-filter-badge";
        togglePaidBillFilters.appendChild(filterBadge);
      }

      filterBadge.textContent = activeFilters;
    } else if (filterBadge) {
      filterBadge.remove();
    }

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  togglePaidBillFilters.addEventListener("click", () => {
    paidBillFiltersOpen = !paidBillFiltersOpen;
    advancedPaidBillFilters.hidden = !paidBillFiltersOpen;

    togglePaidBillFilters.setAttribute(
      "aria-expanded",
      String(paidBillFiltersOpen),
    );
  });

  paidBillSearch.addEventListener("input", () => {
    paidBillFilters.search = paidBillSearch.value;
    updatePaidBillsList();
  });

  paidBillDateFrom.addEventListener("change", () => {
    paidBillFilters.from = paidBillDateFrom.value;
    updatePaidBillsList();
  });

  paidBillDateTo.addEventListener("change", () => {
    paidBillFilters.to = paidBillDateTo.value;
    updatePaidBillsList();
  });

  clearPaidBillFilters.addEventListener("click", () => {
    Object.assign(paidBillFilters, {
      search: "",
      from: "",
      to: "",
    });

    paidBillSearch.value = "";
    paidBillDateFrom.value = "";
    paidBillDateTo.value = "";

    updatePaidBillsList();
  });

  const recurrenceDialog = document.querySelector("#recurrence-dialog");
  const recurrenceForm = document.querySelector("#recurrence-form");
  const recurrenceError = document.querySelector("#recurrence-form-error");
  const recurrenceTitle = document.querySelector("#recurrence-form-title");
  const recurrenceSaveButton = recurrenceForm.querySelector('[type="submit"]');
  const recurrenceAmountMode = recurrenceForm.elements.namedItem("amount_mode");
  const recurrenceAmountHint = document.querySelector(
    "#recurrence-amount-hint",
  );
  const recurrenceList = document.querySelector("#recurrence-list");

  // ============================================================
  // CONFIGURACIÓN DE LAS FUNCIONALIDADES
  // ============================================================

  setupBillsFeature({
    supabase,
    getBills: () => bills,
    setBills: (nextBills) => {
      bills = nextBills;
    },
    renderDashboard,
    toDateInput,
    formatDate,
    parseChileanDate,
    isValidIsoDate,
    billDialog,
    billForm,
    billError,
    billTitle,
    billSaveButton,
    billList,
    paidBillsList,
    getMovements: () => movements,
    setMovements: (nextMovements) => {
      movements = nextMovements;
    },
    refreshBillsAndMovements,
  });

  setupRecurrencesFeature({
    supabase,
    getBills: () => bills,
    setBills: (nextBills) => {
      bills = nextBills;
    },
    getRecurrences: () => recurrences,
    setRecurrences: (nextRecurrences) => {
      recurrences = nextRecurrences;
    },
    renderDashboard,
    toDateInput,
    formatDate,
    parseChileanDate,
    isValidIsoDate,
    recurrenceDialog,
    recurrenceForm,
    recurrenceError,
    recurrenceTitle,
    recurrenceSaveButton,
    recurrenceAmountMode,
    recurrenceAmountHint,
    recurrenceList,
  });

  const form = document.querySelector("#movement-form");
  const errorMessage = document.querySelector("#form-error");
  const dateField = document.querySelector("#movement-date");
  const datePicker = document.querySelector("#date-picker-native");
  const openDatePicker = document.querySelector("#open-date-picker");
  const movementList = document.querySelector("#movement-list");
  const formTitle = document.querySelector("#form-title");
  const saveButton = form.querySelector('[type="submit"]');

  setupMovementFeature({
    supabase,
    getMovements: () => movements,
    setMovements: (nextMovements) => {
      movements = nextMovements;
    },
    financial,
    updateFinancialTotals: (currentMovements, currentFinancial) => {
      updateFinancialTotals(currentMovements, currentFinancial, bills);
    },
    renderDashboard,
    toDateInput,
    formatChileanDate: formatDate,
    parseChileanDate,
    dialog,
    form,
    errorMessage,
    dateField,
    datePicker,
    openDatePicker,
    movementList,
    formTitle,
    saveButton,
  });

  // ============================================================
  // NAVEGACIÓN
  // ============================================================

  document
    .querySelectorAll(".sidebar-nav a, .mobile-nav a, .brand")
    .forEach((link) => {
      link.addEventListener("click", (event) => {
        const href = link.getAttribute("href");

        const views = {
          "#inicio": "inicio",
          "#movimientos": "movimientos",
          "#cuentas": "cuentas",
        };

        const nextView = views[href];

        if (!nextView) return;

        event.preventDefault();

        currentView = nextView;

        const main = document.querySelector(".dashboard-main");

        if (main) {
          main.dataset.view = currentView;
        }

        document
          .querySelectorAll(".sidebar-nav a, .mobile-nav a")
          .forEach((navLink) => {
            const isActive = navLink.getAttribute("href") === href;

            navLink.classList.toggle("is-active", isActive);

            if (isActive) {
              navLink.setAttribute("aria-current", "page");
            } else {
              navLink.removeAttribute("aria-current");
            }
          });
      });
    });

  // El menú móvil dispara los controles existentes para reutilizar sus flujos.
  const mobileAccountMenu = document.querySelector("#mobile-account-menu");

  mobileAccountMenu
    ?.querySelectorAll("[data-account-action]")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const targetId =
          button.dataset.accountAction === "logout"
            ? "#logout-button"
            : "#delete-account-button";

        document.querySelector(targetId)?.click();
        mobileAccountMenu.open = false;
      });
    });

  // ============================================================
  // CIERRE DE SESIÓN
  // ============================================================

  const logoutButton = document.querySelector("#logout-button");

  logoutButton?.addEventListener("click", async () => {
    logoutButton.disabled = true;

    try {
      const { error } = await supabase.auth.signOut({
        scope: "local",
      });

      if (error) {
        console.error("Error al cerrar sesión:", error);
        alert("No se pudo cerrar la sesión. Inténtalo de nuevo.");
        logoutButton.disabled = false;
        return;
      }

      // Limpiar los datos de la sesión anterior.
      movements = [];
      bills = [];
      recurrences = [];

      Object.assign(financial, {
        balance: 0,
        income: 0,
        expenses: 0,
        availableAfterBills: 0,
      });

      currentView = "inicio";

      renderLogin(app, handleLogin, handleSignUp, handlePasswordReset);
    } catch (error) {
      console.error("Error inesperado al cerrar sesión:", error);
      alert("Ocurrió un error al cerrar sesión. Inténtalo de nuevo.");
      logoutButton.disabled = false;
    }
  });

  // ============================================================
  // ELIMINACIÓN DE CUENTA
  // ============================================================

  const deleteAccountButton = document.querySelector("#delete-account-button");
  const deleteAccountDialog = document.querySelector("#delete-account-dialog");
  const deleteAccountForm = document.querySelector("#delete-account-form");
  const deleteAccountConfirmation = document.querySelector(
    "#delete-account-confirmation",
  );
  const deleteAccountError = document.querySelector("#delete-account-error");
  const confirmDeleteAccountButton = document.querySelector(
    "#confirm-delete-account",
  );

  function closeDeleteAccountDialog() {
    deleteAccountDialog.close();
    deleteAccountForm.reset();
    deleteAccountError.hidden = true;
    deleteAccountError.textContent = "";
  }

  deleteAccountButton?.addEventListener("click", () => {
    deleteAccountForm.reset();
    deleteAccountError.hidden = true;
    deleteAccountError.textContent = "";

    deleteAccountDialog.showModal();
    deleteAccountConfirmation.focus();
  });

  document
    .querySelectorAll("#close-delete-account, #cancel-delete-account")
    .forEach((button) => {
      button.addEventListener("click", closeDeleteAccountDialog);
    });

  deleteAccountForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (deleteAccountConfirmation.value.trim() !== "ELIMINAR") {
      deleteAccountError.textContent =
        "Escribe ELIMINAR exactamente para confirmar.";
      deleteAccountError.hidden = false;
      deleteAccountConfirmation.focus();
      return;
    }

    confirmDeleteAccountButton.disabled = true;
    confirmDeleteAccountButton.textContent = "Eliminando cuenta...";
    deleteAccountError.hidden = true;

    try {
      const { error } = await supabase.functions.invoke("delete-account", {
        body: {},
      });

      if (error) {
        console.error("Error al eliminar la cuenta:", error);

        deleteAccountError.textContent =
          "No se pudo eliminar la cuenta. Inténtalo de nuevo.";
        deleteAccountError.hidden = false;
        return;
      }

      const { error: signOutError } = await supabase.auth.signOut({
        scope: "local",
      });

      if (signOutError) {
        console.error(
          "Error al cerrar la sesión después de eliminar:",
          signOutError,
        );
      }

      // Limpia los datos que estaban en memoria.
      movements = [];
      bills = [];
      recurrences = [];

      Object.assign(financial, {
        balance: 0,
        income: 0,
        expenses: 0,
        availableAfterBills: 0,
      });

      currentView = "inicio";

      renderLogin(app, handleLogin, handleSignUp, handlePasswordReset);
    } catch (error) {
      console.error("Error inesperado al eliminar la cuenta:", error);

      deleteAccountError.textContent =
        "Ocurrió un error al eliminar la cuenta. Inténtalo de nuevo.";
      deleteAccountError.hidden = false;
    } finally {
      confirmDeleteAccountButton.disabled = false;
      confirmDeleteAccountButton.textContent = "Eliminar mi cuenta";
    }
  });
}

// ============================================================
// INICIALIZACIÓN
// ============================================================

async function initializeApp() {
  if (window.location.hash.includes("type=recovery")) {
    renderPasswordUpdate(app, handlePasswordUpdate);
    return;
  }

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    renderLogin(app, handleLogin, handleSignUp, handlePasswordReset);
    return;
  }

  if (data.session) {
    await loadAndRenderDashboard();
  } else {
    renderLogin(app, handleLogin, handleSignUp, handlePasswordReset);
  }
}

initializeApp();

import { formatDate, escapeHtml } from "../utils/formatters.js";

// ============================================================
// MOVIMIENTOS
// ============================================================

// Genera la lista de movimientos y sus acciones disponibles.
export function renderMovements(movements, money) {
  if (movements.length === 0) {
    return `
      <li class="empty-state">
        Todavía no hay movimientos registrados.
      </li>
    `;
  }

  return movements
    .map((movement) => {
      const isIncome = movement.type === "income";
      const sign = isIncome ? "+" : "−";
      const amountClass = isIncome ? "is-income" : "is-expense";
      const amountColor = isIncome ? "#65d6a0" : "#ff6b75";

      return `
        <li class="movement-item">
          <span class="movement-icon" aria-hidden="true">
            <i data-lucide="${movement.icon}"></i>
          </span>

          <div class="movement-details">
            <p class="movement-name">
              ${escapeHtml(movement.description)}
            </p>

            <p class="movement-meta">
              ${escapeHtml(movement.category)} · ${formatDate(movement.date)}
            </p>
          </div>

          <p
            class="movement-amount ${amountClass}"
            style="color: ${amountColor} !important;"
          >
            ${sign}${money.format(movement.amount)}
          </p>
          
          
          ${
            !movement.bill_id
              ? `
                <div class="movement-actions">
                  <button
                    class="button-secondary button"
                    type="button"
                    data-action="edit"
                    data-id="${escapeHtml(movement.id)}"
                    aria-label="Editar ${escapeHtml(movement.description)}"
                  >
                    Editar
                  </button>

                  <button
                    class="button-secondary button"
                    type="button"
                    data-action="delete"
                    data-id="${escapeHtml(movement.id)}"
                    aria-label="Eliminar ${escapeHtml(movement.description)}"
                  >
                    Eliminar
                  </button>
                </div>
              `
              : ""
          }

          ${
            movement.attachment_path
              ? `
                <div class="movement-actions">
                  <button
                    class="button-secondary button"
                    type="button"
                    data-action="view-attachment"
                    data-id="${escapeHtml(movement.id)}"
                    aria-label="Ver comprobante de ${escapeHtml(movement.description)}"
                  >
                    Ver comprobante
                  </button>
                </div>
              `
              : ""
          }

        </li>
      `;
    })
    .join("");
}

// ============================================================
// CUENTAS PENDIENTES
// ============================================================

// Muestra únicamente las cuentas que todavía no se han pagado.
export function renderBills(bills, money) {
  const pendingBills = bills.filter((bill) => !bill.is_paid);

  if (pendingBills.length === 0) {
    return `
      <li class="empty-state">
        No hay cuentas pendientes.
      </li>
    `;
  }

  return pendingBills
    .map((bill) => {
      return `
        <li class="bill-item">
          <div class="bill-details">
            <p class="bill-name">
              ${escapeHtml(bill.name)}
            </p>

            <p class="bill-meta">
              Vence el ${formatDate(bill.due_date)}
            </p>
          </div>

          <p class="bill-amount">
            ${money.format(Number(bill.amount))}
          </p>

          <div class="bill-actions">

            <button
              class="button-secondary button"
              type="button"
              data-bill-action="delete"
              data-id="${escapeHtml(bill.id)}"
            >
              Eliminar
            </button>

            <button
              class="button-secondary button"
              type="button"
              data-bill-action="toggle-paid"
              data-id="${escapeHtml(bill.id)}"
            >
              Marcar pagada
            </button>
          </div>
        </li>
      `;
    })
    .join("");
}

// ============================================================
// HISTORIAL DE CUENTAS PAGADAS
// ============================================================

// Ordena las cuentas pagadas desde la fecha más reciente.
export function renderPaidBills(bills, money) {
  const paidBills = bills
    .filter((bill) => bill.is_paid)
    .sort((a, b) => {
      const dateA = a.paid_at || a.due_date;
      const dateB = b.paid_at || b.due_date;
      return dateB.localeCompare(dateA);
    });

  if (paidBills.length === 0) {
    return `
      <li class="empty-state">
        Todavía no hay cuentas pagadas para mostrar.
      </li>
    `;
  }

  return paidBills
    .map((bill) => {
      const paidDate = bill.paid_at
        ? formatDate(bill.paid_at.slice(0, 10))
        : "Fecha de pago no registrada";

      return `
        <li class="bill-item">
          <div class="bill-details">
            <p class="bill-name">
              ${escapeHtml(bill.name)}
            </p>

            <p class="bill-meta">
              ${bill.paid_at ? `Pagada el ${paidDate}` : escapeHtml(paidDate)}
            </p>

            <p class="bill-meta">
              Vencía el ${formatDate(bill.due_date)}
            </p>

            <p class="bill-amount">
              ${money.format(Number(bill.amount))}
            </p>
          </div>

          <div class="bill-actions">
            <button
              class="button-secondary button"
              type="button"
              data-paid-action="edit"
              data-id="${escapeHtml(bill.id)}"
            >
              Editar
            </button>

            ${
              bill.attachment_path
                ? `
                  <button
                    class="button-secondary button"
                    type="button"
                    data-paid-action="view-attachment"
                    data-id="${escapeHtml(bill.id)}"
                  >
                    Ver comprobante
                  </button>
                `
                : ""
            }

            <button
              class="button-secondary button"
              type="button"
              data-paid-action="undo"
              data-id="${escapeHtml(bill.id)}"
            >
              Deshacer pago
            </button>

            <button
              class="button-secondary button"
              type="button"
              data-paid-action="delete"
              data-id="${escapeHtml(bill.id)}"
            >
              Eliminar
            </button>
          </div>
        </li>
      `;
    })
    .join("");
}

// ============================================================
// RECURRENCIAS
// ============================================================

// Muestra las recurrencias configuradas y sus acciones disponibles.
export function renderRecurrences(recurrences, money) {
  if (recurrences.length === 0) {
    return `
      <li class="empty-state">
        Todavía no hay recurrencias configuradas.
      </li>
    `;
  }

  return recurrences
    .map(
      (recurrence) => `
        <li class="bill-item">
          <div class="bill-details">
            <p class="bill-name">
              ${escapeHtml(recurrence.name)}
            </p>

            <p class="bill-meta">
              Día ${recurrence.due_day} de cada mes
              · ${
                recurrence.amount_mode === "fixed"
                  ? "Importe fijo"
                  : "Importe variable"
              }
              · ${recurrence.is_active ? "Activa" : "Inactiva"}
            </p>

            <p class="bill-amount">
              ${money.format(recurrence.amount)}
            </p>
          </div>

          <div class="bill-actions">
            <button
              class="button-secondary button"
              type="button"
              data-recurrence-action="edit"
              data-id="${escapeHtml(recurrence.id)}"
            >
              Editar
            </button>

            <button
              class="button-secondary button"
              type="button"
              data-recurrence-action="toggle"
              data-id="${escapeHtml(recurrence.id)}"
            >
              ${recurrence.is_active ? "Desactivar" : "Activar"}
            </button>

            <button
              class="button-secondary button"
              type="button"
              data-recurrence-action="delete"
              data-id="${escapeHtml(recurrence.id)}"
            >
              Eliminar
            </button>
          </div>
        </li>
      `,
    )
    .join("");
}

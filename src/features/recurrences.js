import { generateCurrentMonthBills } from "../services/recurrences.js";
import { normalizeBill } from "./bills.js";
import { notify } from "../ui/notifications.js";

// ============================================================
// FORMATO DE IMPORTES
// ============================================================

const moneyInputFormatter = new Intl.NumberFormat("es-CL", {
  maximumFractionDigits: 0,
  useGrouping: true,
});

function formatMoneyInput(input) {
  const digits = input.value.replace(/\D/g, "");
  input.value = digits ? moneyInputFormatter.format(Number(digits)) : "";
}

// ============================================================
// CIFRA
// Gestión de recurrencias
// ============================================================

export function setupRecurrencesFeature({
  supabase,
  getBills,
  setBills,
  getRecurrences,
  setRecurrences,
  renderDashboard,
  toDateInput,
  isValidIsoDate,
  formatDate,
  parseChileanDate,
  recurrenceDialog,
  recurrenceForm,
  recurrenceError,
  recurrenceTitle,
  recurrenceSaveButton,
  recurrenceAmountMode,
  recurrenceAmountHint,
  recurrenceList,
}) {
  // ==========================================================
  // FORMULARIO Y MENSAJES
  // ==========================================================

  function closeRecurrenceForm() {
    recurrenceDialog.close();
  }

  function showError(message) {
    recurrenceError.textContent = message;
    recurrenceError.hidden = false;
  }

  const amountInput = recurrenceForm.elements.namedItem("amount");
  const startDateField = recurrenceForm.elements.namedItem("start_date");
  const endDateField = recurrenceForm.elements.namedItem("end_date");

  const startDatePicker = document.querySelector("#recurrence-start-picker");
  const endDatePicker = document.querySelector("#recurrence-end-picker");

  const openStartDatePicker = document.querySelector(
    "#open-recurrence-start-picker",
  );
  const openEndDatePicker = document.querySelector(
    "#open-recurrence-end-picker",
  );

  function connectDateField(field, picker, openButton) {
    field.addEventListener("input", () => {
      const isoDate = parseChileanDate(field.value);

      if (isoDate) {
        picker.value = isoDate;
      }
    });

    openButton.addEventListener("click", () => {
      if (field.readOnly) return;

      if (typeof picker.showPicker === "function") {
        picker.showPicker();
      } else {
        picker.click();
      }
    });

    picker.addEventListener("change", () => {
      field.value = picker.value ? formatDate(picker.value) : "";
    });
  }

  connectDateField(startDateField, startDatePicker, openStartDatePicker);
  connectDateField(endDateField, endDatePicker, openEndDatePicker);

  amountInput.addEventListener("input", () => {
    formatMoneyInput(amountInput);
  });

  // ==========================================================
  // DATOS Y SESIÓN
  // ==========================================================

  async function reloadBills() {
    const { data, error } = await supabase
      .from("bills")
      .select(
        "id, name, category, amount, due_date, is_paid, recurrence_id, paid_at, created_at",
      )
      .order("due_date", { ascending: true });

    if (error) throw error;

    setBills((data || []).map(normalizeBill));
  }

  async function getAuthenticatedUser() {
    const { data, error } = await supabase.auth.getUser();

    if (error || !data.user) {
      throw new Error(
        "Tu sesión no está disponible. Inicia sesión nuevamente.",
      );
    }

    return data.user;
  }

  // ==========================================================
  // APERTURA Y EDICIÓN DEL FORMULARIO
  // ==========================================================

  function openRecurrenceForEdit(recurrence) {
    recurrenceForm.reset();

    recurrenceForm.elements.namedItem("recurrenceId").value = recurrence.id;
    recurrenceForm.elements.namedItem("name").value = recurrence.name;
    recurrenceForm.elements.namedItem("category").value = recurrence.category;
    recurrenceForm.elements.namedItem("due_day").value = recurrence.due_day;
    recurrenceForm.elements.namedItem("amount").value =
      moneyInputFormatter.format(Number(recurrence.amount));
    recurrenceForm.elements.namedItem("amount_mode").value =
      recurrence.amount_mode;
    startDatePicker.value = recurrence.start_date;
    startDateField.value = formatDate(recurrence.start_date);

    endDatePicker.value = recurrence.end_date || "";
    endDateField.value = recurrence.end_date
      ? formatDate(recurrence.end_date)
      : "";

    recurrenceTitle.textContent = "Editar recurrencia";
    recurrenceSaveButton.textContent = "Guardar cambios";
    recurrenceError.hidden = true;

    recurrenceAmountHint.textContent =
      recurrence.amount_mode === "variable"
        ? "Este importe es una referencia. Puedes ajustar cada vencimiento por separado."
        : "Se usará este importe para los nuevos vencimientos.";

    recurrenceDialog.showModal();
  }

  // Prepara el formulario para crear una recurrencia.
  document.querySelector("#add-recurrence").addEventListener("click", () => {
    recurrenceForm.reset();

    recurrenceForm.elements.namedItem("recurrenceId").value = "";
    const today = toDateInput(new Date());

    startDatePicker.value = today;
    startDateField.value = formatDate(today);

    endDatePicker.value = "";
    endDateField.value = "";
    recurrenceForm.elements.namedItem("due_day").value = "5";
    recurrenceForm.elements.namedItem("category").value = "Servicios";
    recurrenceForm.elements.namedItem("amount_mode").value = "fixed";

    recurrenceTitle.textContent = "Nueva recurrencia";
    recurrenceSaveButton.textContent = "Guardar recurrencia";
    recurrenceError.hidden = true;

    recurrenceAmountHint.textContent =
      "Se usará este importe para los nuevos vencimientos.";

    recurrenceDialog.showModal();
  });

  document
    .querySelector("#close-recurrence-form")
    .addEventListener("click", closeRecurrenceForm);

  document
    .querySelector("#cancel-recurrence-form")
    .addEventListener("click", closeRecurrenceForm);

  recurrenceDialog.addEventListener("click", (event) => {
    if (event.target === recurrenceDialog) {
      closeRecurrenceForm();
    }
  });

  recurrenceAmountMode.addEventListener("change", () => {
    recurrenceAmountHint.textContent =
      recurrenceAmountMode.value === "variable"
        ? "Este importe será una referencia inicial. La factura real puede variar; podrás ajustar el importe de cada vencimiento."
        : "Se usará este importe para los nuevos vencimientos.";
  });

  // ==========================================================
  // ACCIONES SOBRE RECURRENCIAS
  // ==========================================================

  recurrenceList.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-recurrence-action]");

    if (!button) return;

    const recurrence = getRecurrences().find(
      (item) => item.id === button.dataset.id,
    );

    if (!recurrence) {
      alert("No se encontró la recurrencia. Actualiza la aplicación.");
      return;
    }

    const action = button.dataset.recurrenceAction;

    if (action === "edit") {
      openRecurrenceForEdit(recurrence);
      return;
    }

    // Elimina la recurrencia y sus cuentas pendientes asociadas.
    if (action === "delete") {
      const confirmed = window.confirm(
        `¿Eliminar la recurrencia "${recurrence.name}"?\n\n` +
          "Se eliminarán sus cuentas pendientes. " +
          "Los pagos y movimientos anteriores se conservarán.",
      );

      if (!confirmed) return;

      button.disabled = true;

      try {
        const user = await getAuthenticatedUser();

        const { error: billsError } = await supabase
          .from("bills")
          .delete()
          .eq("recurrence_id", recurrence.id)
          .eq("user_id", user.id)
          .eq("is_paid", false);

        if (billsError) throw billsError;

        const { data, error } = await supabase
          .from("bill_recurrences")
          .delete()
          .eq("id", recurrence.id)
          .eq("user_id", user.id)
          .select("id");

        if (error) throw error;

        if (!data || data.length === 0) {
          throw new Error(
            "No se eliminó la recurrencia. Comprueba los permisos de tu cuenta.",
          );
        }

        setRecurrences(
          getRecurrences().filter((item) => item.id !== recurrence.id),
        );

        await reloadBills();
        renderDashboard();
        notify("Recurrencia eliminada con éxito.", "success");
      } catch (error) {
        console.error("Error al eliminar recurrencia:", error);
        alert(
          error.message ||
            "No se pudo eliminar la recurrencia. Revisa la consola.",
        );
      } finally {
        if (button.isConnected) button.disabled = false;
      }

      return;
    }

    if (action !== "toggle") return;

    const nextActive = !recurrence.is_active;
    const actionText = nextActive ? "activar" : "desactivar";

    const confirmed = window.confirm(
      `¿Quieres ${actionText} la recurrencia "${recurrence.name}"?`,
    );

    if (!confirmed) return;

    button.disabled = true;

    try {
      const user = await getAuthenticatedUser();

      // Al reactivar, comienza un nuevo período de generación desde hoy.
      const updates = {
        is_active: nextActive,
      };

      if (nextActive) {
        updates.active_since = toDateInput(new Date());
      }

      const { data, error } = await supabase
        .from("bill_recurrences")
        .update(updates)
        .eq("id", recurrence.id)
        .eq("user_id", user.id)
        .select(
          "id, name, category, due_day, start_date, active_since, end_date, amount_mode, amount, is_active, created_at, updated_at",
        )
        .single();

      if (error) throw error;

      setRecurrences(
        getRecurrences().map((item) =>
          item.id === data.id ? { ...data, amount: Number(data.amount) } : item,
        ),
      );

      if (nextActive) {
        await generateCurrentMonthBills(user.id);
      }

      await reloadBills();
      renderDashboard();

      notify(
        `Recurrencia ${nextActive ? "activada" : "desactivada"} con éxito.`,
        "success",
      );
    } catch (error) {
      console.error("Error al cambiar el estado de la recurrencia:", error);
      alert(
        error.message || "No se pudo completar el cambio. Revisa la consola.",
      );
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  });

  // ==========================================================
  // CREACIÓN Y ACTUALIZACIÓN DE RECURRENCIAS
  // ==========================================================

  recurrenceForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    recurrenceError.hidden = true;

    const formData = new FormData(recurrenceForm);

    const recurrenceId = String(formData.get("recurrenceId") || "");
    const name = String(formData.get("name") || "").trim();
    const category = String(formData.get("category") || "");
    const dueDay = Number(formData.get("due_day"));
    const amount = Number(
      String(formData.get("amount") || "").replace(/\D/g, ""),
    );
    const amountMode = String(formData.get("amount_mode") || "");
    const startDate =
      parseChileanDate(String(formData.get("start_date") || "")) || "";

    const endDateInput = String(formData.get("end_date") || "");
    const endDate = endDateInput ? parseChileanDate(endDateInput) || "" : "";

    if (!name || name.length > 80) {
      showError("Ingresa un nombre válido.");
      return;
    }

    if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) {
      showError("El día de vencimiento debe estar entre 1 y 31.");
      return;
    }

    if (
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      amount > 1000000000000
    ) {
      showError("Ingresa un importe válido, mayor que cero.");
      return;
    }

    if (!["fixed", "variable"].includes(amountMode)) {
      showError("Selecciona un tipo de importe válido.");
      return;
    }

    if (!isValidIsoDate(startDate)) {
      showError("Selecciona una fecha de inicio válida.");
      return;
    }

    if (endDate && !isValidIsoDate(endDate)) {
      showError("Selecciona una fecha de término válida.");
      return;
    }

    if (endDate && endDate < startDate) {
      showError("La fecha de término no puede ser anterior al inicio.");
      return;
    }

    recurrenceSaveButton.disabled = true;
    recurrenceSaveButton.textContent = "Guardando…";

    let savedId = recurrenceId;

    try {
      const user = await getAuthenticatedUser();

      const values = {
        name,
        category,
        due_day: dueDay,
        amount,
        amount_mode: amountMode,
        start_date: startDate,
        end_date: endDate || null,
      };

      let request;

      if (recurrenceId) {
        // Editar una recurrencia no modifica su activación vigente.
        request = supabase
          .from("bill_recurrences")
          .update(values)
          .eq("id", recurrenceId)
          .eq("user_id", user.id);
      } else {
        // Una recurrencia nueva comienza activa desde su fecha inicial.
        request = supabase.from("bill_recurrences").insert({
          ...values,
          user_id: user.id,
          is_active: true,
          active_since: startDate,
        });
      }

      const { data, error } = await request
        .select(
          "id, name, category, due_day, start_date, active_since, end_date, amount_mode, amount, is_active, created_at, updated_at",
        )
        .single();

      if (error) throw error;

      const savedRecurrence = {
        ...data,
        amount: Number(data.amount),
      };

      savedId = data.id;
      recurrenceForm.elements.namedItem("recurrenceId").value = savedId;

      if (recurrenceId) {
        setRecurrences(
          getRecurrences().map((item) =>
            item.id === savedId ? savedRecurrence : item,
          ),
        );
      } else {
        setRecurrences([...getRecurrences(), savedRecurrence]);
      }

      recurrenceTitle.textContent = "Editar recurrencia";

      await generateCurrentMonthBills(user.id);
      await reloadBills();

      recurrenceDialog.close();
      renderDashboard();

      notify(
        recurrenceId
          ? "Recurrencia actualizada con éxito."
          : "Recurrencia guardada con éxito.",
        "success",
      );
    } catch (error) {
      console.error("Error al guardar recurrencia:", error);

      if (savedId) {
        recurrenceForm.elements.namedItem("recurrenceId").value = savedId;
        recurrenceTitle.textContent = "Editar recurrencia";

        showError(
          "La recurrencia puede haberse guardado, pero no se pudieron actualizar las cuentas. No crees otra: recarga la aplicación y revisa el resultado.",
        );
      } else {
        showError(
          error.message ||
            "No se pudo guardar la recurrencia. Revisa la consola.",
        );
      }
    } finally {
      recurrenceSaveButton.disabled = false;
      recurrenceSaveButton.textContent = recurrenceForm.elements.namedItem(
        "recurrenceId",
      ).value
        ? "Guardar cambios"
        : "Guardar recurrencia";
    }
  });
}

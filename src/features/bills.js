// ============================================================
// CIFRA
// Gestión de cuentas
// ============================================================

import { notify } from "../ui/notifications.js";

// ============================================================
// FORMATO Y VALIDACIÓN DE COMPROBANTES
// ============================================================

const moneyInputFormatter = new Intl.NumberFormat("es-CL", {
  maximumFractionDigits: 0,
  useGrouping: true,
});

function formatMoneyInput(input) {
  input.value = input.value
    ? moneyInputFormatter.format(Number(input.value.replace(/\D/g, "")))
    : "";
}
const RECEIPT_BUCKET = "receipt-attachments";
const MAX_RECEIPT_SIZE = 10 * 1024 * 1024;

const RECEIPT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

function validateBillReceipt(file) {
  if (!RECEIPT_TYPES.includes(file.type)) {
    return "Solo se permiten imágenes JPG, PNG, WEBP o archivos PDF.";
  }

  if (file.size > MAX_RECEIPT_SIZE) {
    return "El comprobante no puede superar los 10 MB.";
  }

  return "";
}

function getBillReceiptExtension(file) {
  const extensions = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
  };

  return extensions[file.type];
}

async function uploadBillReceipt(supabase, userId, billId, file) {
  const extension = getBillReceiptExtension(file);
  const path =
    `${userId}/bills/${billId}/` + `${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
    });

  if (error) throw error;

  return {
    attachment_path: path,
    attachment_name: file.name,
  };
}

// ============================================================
// NORMALIZACIÓN DE CUENTAS
// ============================================================

// Normaliza el importe para trabajar siempre con valores numéricos.
export function normalizeBill(bill) {
  return {
    ...bill,
    amount: Number(bill.amount),
  };
}

export function setupBillsFeature({
  supabase,
  getBills,
  setBills,
  getMovements,
  setMovements,
  refreshBillsAndMovements,
  renderDashboard,
  toDateInput,
  isValidIsoDate,
  formatDate,
  parseChileanDate,
  billDialog,
  billForm,
  billError,
  billTitle,
  billSaveButton,
  billList,
  paidBillsList,
}) {
  // ==========================================================
  // FORMULARIO Y MENSAJES
  // ==========================================================

  function closeBillForm() {
    billDialog.close();
  }

  function showError(message) {
    billError.textContent = message;
    billError.hidden = false;
  }

  const amountInput = billForm.elements.namedItem("amount");
  const billDateField = billForm.elements.namedItem("due_date");
  const billDatePicker = document.querySelector("#bill-date-picker");
  const openBillDatePicker = document.querySelector("#open-bill-date-picker");

  billDateField.addEventListener("input", () => {
    const isoDate = parseChileanDate(billDateField.value);

    if (isoDate) {
      billDatePicker.value = isoDate;
    }
  });

  openBillDatePicker.addEventListener("click", () => {
    if (billDateField.readOnly) return;

    if (typeof billDatePicker.showPicker === "function") {
      billDatePicker.showPicker();
    } else {
      billDatePicker.click();
    }
  });

  billDatePicker.addEventListener("change", () => {
    if (billDatePicker.value) {
      billDateField.value = formatDate(billDatePicker.value);
    }
  });

  const attachmentField = document.querySelector("#bill-attachment-field");
  const attachmentInput = document.querySelector("#bill-attachment");
  const attachmentCurrent = document.querySelector("#bill-attachment-current");
  const removeBillAttachmentButton = document.querySelector(
    "#remove-bill-attachment",
  );

  function resetBillAttachment() {
    attachmentInput.value = "";
    attachmentCurrent.textContent = "";
    attachmentCurrent.hidden = true;
    attachmentField.hidden = true;
    removeBillAttachmentButton.hidden = true;
  }

  amountInput.addEventListener("input", () => {
    formatMoneyInput(amountInput);
  });

  // Prepara el formulario para registrar una cuenta nueva.
  document.querySelector("#add-bill").addEventListener("click", () => {
    billForm.reset();
    resetBillAttachment();

    billForm.elements.namedItem("billId").value = "";
    billTitle.textContent = "Nueva cuenta";
    billSaveButton.textContent = "Guardar cuenta";
    billError.hidden = true;

    const today = toDateInput(new Date());

    billDatePicker.value = today;
    billDateField.value = formatDate(today);
    billDateField.readOnly = false;
    openBillDatePicker.disabled = false;

    billDialog.showModal();
  });

  document
    .querySelector("#close-bill-form")
    .addEventListener("click", closeBillForm);

  document
    .querySelector("#cancel-bill-form")
    .addEventListener("click", closeBillForm);

  // Cierra el formulario al hacer clic en el fondo del diálogo.
  billDialog.addEventListener("click", (event) => {
    if (event.target === billDialog) {
      closeBillForm();
    }
  });

  // ==========================================================
  // LISTA DE CUENTAS PENDIENTES
  // ==========================================================

  // Gestiona las acciones disponibles para cada cuenta.
  billList.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-bill-action]");

    if (!button) return;

    const bill = getBills().find((item) => item.id === button.dataset.id);

    if (!bill) {
      alert("No se encontró la cuenta. Actualiza la página.");
      return;
    }

    const action = button.dataset.billAction;

    // Carga los datos de la cuenta seleccionada para editarla.
    if (action === "edit") {
      billForm.reset();

      billForm.elements.namedItem("billId").value = bill.id;
      billForm.elements.namedItem("name").value = bill.name;
      billForm.elements.namedItem("amount").value = moneyInputFormatter.format(
        Number(bill.amount),
      );
      billDatePicker.value = bill.due_date;
      billDateField.value = formatDate(bill.due_date);
      billDateField.readOnly = Boolean(bill.recurrence_id);
      openBillDatePicker.disabled = Boolean(bill.recurrence_id);

      billTitle.textContent = "Editar cuenta";
      billSaveButton.textContent = "Guardar cambios";
      billError.hidden = true;

      billDialog.showModal();
      return;
    }

    // Elimina una cuenta pendiente después de confirmar.
    if (action === "delete") {
      const confirmed = window.confirm(
        `¿Eliminar la cuenta "${bill.name}"?\n\n` +
          "Se eliminará permanentemente y no se registrará ningún pago.\n\n" +
          "Esta acción no se puede deshacer.",
      );

      if (!confirmed) return;

      button.disabled = true;

      try {
        const { data: userData, error: userError } =
          await supabase.auth.getUser();

        if (userError || !userData.user) {
          throw new Error(
            "Tu sesión no está disponible. Inicia sesión nuevamente.",
          );
        }

        const { error } = await supabase.rpc("delete_pending_bill", {
          p_bill_id: bill.id,
        });

        if (error) throw error;

        await refreshBillsAndMovements();

        notify("Cuenta pendiente eliminada.", "success");
      } catch (error) {
        console.error("Error al eliminar cuenta pendiente:", error);

        alert(error.message || "No se pudo eliminar la cuenta pendiente.");
      } finally {
        if (button.isConnected) {
          button.disabled = false;
        }
      }

      return;
    }

    // Alterna el estado de pago y registra la fecha correspondiente.
    if (action === "toggle-paid") {
      button.disabled = true;

      try {
        const { data: userData, error: userError } =
          await supabase.auth.getUser();

        if (userError || !userData.user) {
          alert("Tu sesión no está disponible. Inicia sesión nuevamente.");
          return;
        }

        const nextPaid = !bill.is_paid;

        if (nextPaid) {
          const { error: paymentError } = await supabase.rpc("pay_bill", {
            p_bill_id: bill.id,
          });

          if (paymentError) {
            console.error("Error al registrar el pago:", paymentError);
            alert("No se pudo registrar el pago de la cuenta.");
            return;
          }
        } else {
          const { error: undoError } = await supabase.rpc("unpay_bill", {
            p_bill_id: bill.id,
          });

          if (undoError) {
            console.error("Error al revertir el pago:", undoError);
            alert("No se pudo revertir el pago de la cuenta.");
            return;
          }
        }

        notify(
          nextPaid
            ? "Cuenta marcada como pagada."
            : "Cuenta marcada como pendiente.",
          "success",
        );

        await refreshBillsAndMovements();
      } catch (error) {
        console.error("Error al actualizar cuenta:", error);
        alert("Ocurrió un error al actualizar la cuenta.");
      } finally {
        if (button.isConnected) {
          button.disabled = false;
        }
      }
    }
  });

  removeBillAttachmentButton.addEventListener("click", async () => {
    const billId = String(billForm.elements.namedItem("billId").value || "");

    const bill = getBills().find((item) => item.id === billId);

    if (!bill || !bill.is_paid || !bill.attachment_path) {
      alert("No se encontró el comprobante de la cuenta pagada.");
      return;
    }

    const confirmed = window.confirm(
      "¿Quitar el comprobante de esta cuenta pagada?",
    );

    if (!confirmed) return;

    removeBillAttachmentButton.disabled = true;

    try {
      const { data: userData, error: userError } =
        await supabase.auth.getUser();

      if (userError || !userData.user) {
        throw new Error("Tu sesión no está disponible.");
      }

      const oldPath = bill.attachment_path;

      const { data, error } = await supabase
        .from("bills")
        .update({
          attachment_path: null,
          attachment_name: null,
        })
        .eq("id", bill.id)
        .eq("user_id", userData.user.id)
        .eq("is_paid", true)
        .select("id")
        .single();

      if (error) throw error;
      if (!data) throw new Error("No se pudo actualizar la cuenta.");

      const { error: storageError } = await supabase.storage
        .from(RECEIPT_BUCKET)
        .remove([oldPath]);

      if (storageError) {
        console.warn("No se pudo eliminar el archivo:", storageError);
      }

      setBills(
        getBills().map((item) =>
          item.id === bill.id
            ? { ...item, attachment_path: null, attachment_name: null }
            : item,
        ),
      );

      attachmentCurrent.textContent = "";
      attachmentCurrent.hidden = true;
      removeBillAttachmentButton.hidden = true;

      renderDashboard();
      notify("Comprobante quitado.", "success");
    } catch (error) {
      console.error("Error al quitar el comprobante:", error);
      alert(error.message || "No se pudo quitar el comprobante.");
    } finally {
      removeBillAttachmentButton.disabled = false;
    }
  });

  // ==========================================================
  // HISTORIAL DE CUENTAS PAGADAS
  // ==========================================================

  // Gestiona las acciones de cada cuenta del historial.
  paidBillsList.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-paid-action]");

    if (!button) return;

    const bill = getBills().find((item) => item.id === button.dataset.id);
    const action = button.dataset.paidAction;

    if (!bill || !bill.is_paid) {
      alert("No se encontró la cuenta pagada. Actualiza la aplicación.");
      return;
    }
    // Solo permite editar cuentas que siguen marcadas como pagadas.
    if (action === "edit") {
      billForm.reset();
      resetBillAttachment();

      billForm.elements.namedItem("billId").value = bill.id;
      billForm.elements.namedItem("name").value = bill.name;
      billForm.elements.namedItem("amount").value = moneyInputFormatter.format(
        Number(bill.amount),
      );
      billDatePicker.value = bill.due_date;
      billDateField.value = formatDate(bill.due_date);
      billDateField.readOnly = Boolean(bill.recurrence_id);
      openBillDatePicker.disabled = Boolean(bill.recurrence_id);

      // El comprobante solo se habilita para una cuenta pagada existente.
      attachmentField.hidden = false;

      if (bill.attachment_path) {
        attachmentCurrent.textContent = `Comprobante actual: ${bill.attachment_name || "Archivo adjunto"}`;
        attachmentCurrent.hidden = false;
        removeBillAttachmentButton.hidden = false;
      }

      billTitle.textContent = "Editar cuenta pagada";
      billSaveButton.textContent = "Guardar cambios";
      billError.hidden = true;

      billDialog.showModal();
      return;
    }

    // Abrir el comprobante de una cuenta pagada.
    if (action === "view-attachment") {
      if (!bill.attachment_path) {
        alert("Esta cuenta no tiene un comprobante adjunto.");
        return;
      }

      button.disabled = true;

      try {
        const { data: userData, error: userError } =
          await supabase.auth.getUser();

        if (userError || !userData.user) {
          throw new Error(
            "Tu sesión no está disponible. Inicia sesión nuevamente.",
          );
        }

        const { data, error } = await supabase.storage
          .from(RECEIPT_BUCKET)
          .createSignedUrl(bill.attachment_path, 60);

        if (error) throw error;

        window.open(data.signedUrl, "_blank", "noopener,noreferrer");
      } catch (error) {
        console.error("Error al abrir el comprobante de la cuenta:", error);
        alert("No se pudo abrir el comprobante. Inténtalo de nuevo.");
      } finally {
        button.disabled = false;
      }

      return;
    }

    // Elimina una cuenta pagada de forma permanente.
    if (action === "delete") {
      const confirmed = window.confirm(
        `¿Eliminar "${bill.name}" del historial?\n\nEsta acción no se puede deshacer.`,
      );

      if (!confirmed) return;

      button.disabled = true;

      try {
        const { data: userData, error: userError } =
          await supabase.auth.getUser();

        if (userError || !userData.user) {
          throw new Error(
            "Tu sesión no está disponible. Inicia sesión nuevamente.",
          );
        }

        const { data, error } = await supabase
          .from("bills")
          .delete()
          .eq("id", bill.id)
          .eq("user_id", userData.user.id)
          .eq("is_paid", true)
          .select("id");

        if (error) throw error;

        if (!data?.length) {
          throw new Error(
            "No se pudo eliminar la cuenta. Actualiza el historial e inténtalo nuevamente.",
          );
        }

        await refreshBillsAndMovements();
        notify("Cuenta pagada eliminada.", "success");
      } catch (error) {
        console.error("Error al eliminar cuenta pagada:", error);
        alert(error.message || "No se pudo eliminar la cuenta.");
      } finally {
        if (button.isConnected) button.disabled = false;
      }

      return;
    }

    // Permite deshacer un pago.
    if (action !== "undo") return;

    const confirmed = window.confirm(
      `¿Deshacer el pago de "${bill.name}"?\n\n` +
        "La cuenta volverá a aparecer entre las pendientes.",
    );

    if (!confirmed) return;

    button.disabled = true;
    button.textContent = "Actualizando…";

    try {
      const { data: userData, error: userError } =
        await supabase.auth.getUser();

      if (userError || !userData.user) {
        throw new Error(
          "Tu sesión no está disponible. Inicia sesión nuevamente.",
        );
      }

      const { error: undoError } = await supabase.rpc("unpay_bill", {
        p_bill_id: bill.id,
      });

      if (undoError) throw undoError;

      await refreshBillsAndMovements();
      notify("Pago revertido a pendiente con éxito.", "success");
    } catch (error) {
      console.error("Error al deshacer el pago:", error);
      alert(error.message || "No se pudo deshacer el pago.");
    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.textContent = "Deshacer pago";
      }
    }
  });

  // Elimina todas las cuentas pagadas del usuario.
  document
    .querySelector("#delete-paid-history")
    ?.addEventListener("click", async (event) => {
      const button = event.currentTarget;

      const paidBills = getBills().filter((bill) => bill.is_paid);

      if (paidBills.length === 0) {
        notify("No hay cuentas pagadas para eliminar.", "info");
        return;
      }

      const confirmed = window.confirm(
        `¿Eliminar las ${paidBills.length} cuentas pagadas del historial?\n\n` +
          "También se eliminarán sus movimientos asociados. " +
          "Los movimientos manuales y las cuentas pendientes se conservarán. " +
          "Esta acción no se puede deshacer.",
      );

      if (!confirmed) return;

      button.disabled = true;

      try {
        const { data: userData, error: userError } =
          await supabase.auth.getUser();

        if (userError || !userData.user) {
          throw new Error(
            "Tu sesión no está disponible. Inicia sesión nuevamente.",
          );
        }

        const { data, error } = await supabase.rpc("delete_paid_bill_history");
        console.log("Resultado del borrado masivo:", { data, error });

        if (error) throw error;

        const deletedCount = Number(data?.deleted_count);

        if (!Number.isInteger(deletedCount) || deletedCount < 0) {
          throw new Error(
            "La respuesta del servidor no fue válida. Actualiza la aplicación.",
          );
        }

        // Vuelve a cargar los datos reales desde Supabase.
        await refreshBillsAndMovements();

        notify(
          deletedCount === 0
            ? "No había cuentas pagadas para eliminar."
            : deletedCount === 1
              ? "Se eliminó 1 cuenta pagada y sus movimientos asociados."
              : `Se eliminaron ${deletedCount} cuentas pagadas y sus movimientos asociados.`,
          "success",
        );
      } catch (error) {
        console.error("Error al borrar el historial:", error);
        alert(
          error.message ||
            "No se pudo borrar el historial. Tus datos deben verificarse en Supabase.",
        );
      } finally {
        if (button.isConnected) button.disabled = false;
      }
    });

  // ==========================================================
  // CREACIÓN Y ACTUALIZACIÓN DE CUENTAS
  // ==========================================================

  billForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    billError.hidden = true;

    const formData = new FormData(billForm);

    const billId = String(formData.get("billId") || "");
    const name = String(formData.get("name") || "").trim();

    const existingBill = billId
      ? getBills().find((item) => item.id === billId)
      : null;

    if (billId && !existingBill) {
      showError("No se encontró la cuenta que quieres editar.");
      return;
    }

    const selectedFile = formData.get("attachment");
    const receiptFile =
      selectedFile instanceof File && selectedFile.size > 0
        ? selectedFile
        : null;

    if (receiptFile && (!billId || !existingBill?.is_paid)) {
      showError("Solo puedes adjuntar comprobantes a cuentas ya pagadas.");
      return;
    }

    if (receiptFile) {
      const receiptError = validateBillReceipt(receiptFile);

      if (receiptError) {
        showError(receiptError);
        return;
      }
    }
    const amount = Number(
      String(formData.get("amount") || "").replace(/\D/g, ""),
    );
    const dueDate =
      parseChileanDate(String(formData.get("due_date") || "")) || "";

    // Valida el nombre de la cuenta.
    if (!name || name.length > 80) {
      showError("Ingresa un nombre válido para la cuenta.");
      return;
    }

    // Acepta únicamente importes enteros positivos dentro del límite.
    if (
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      amount > 1000000000000
    ) {
      showError("Ingresa un importe válido, mayor que cero.");
      return;
    }

    // Comprueba que la fecha tenga un formato y un valor válidos.
    if (!isValidIsoDate(dueDate)) {
      showError("Selecciona una fecha de vencimiento válida.");
      return;
    }

    billSaveButton.disabled = true;
    billSaveButton.textContent = "Guardando…";

    try {
      const { data: userData, error: userError } =
        await supabase.auth.getUser();

      if (userError || !userData.user) {
        showError("Tu sesión no está disponible. Inicia sesión nuevamente.");
        return;
      }

      const values = {
        name,
        amount,
        due_date: dueDate,
      };

      // Actualiza la cuenta existente o crea una nueva.
      let request;

      if (billId) {
        request = supabase
          .from("bills")
          .update(values)
          .eq("id", billId)
          .eq("user_id", userData.user.id);
      } else {
        request = supabase.from("bills").insert({
          ...values,
          user_id: userData.user.id,
        });
      }

      const { data, error } = await request
        .select(
          "id, name, category, amount, due_date, is_paid, recurrence_id, paid_at, created_at, attachment_path, attachment_name",
        )
        .single();

      if (error) {
        console.error("Error al guardar cuenta:", error);
        showError("No se pudo guardar la cuenta. Inténtalo de nuevo.");
        return;
      }

      let savedRecord = data;

      // Sube el comprobante solo para una cuenta que sigue pagada.
      if (receiptFile && existingBill?.is_paid) {
        let uploadedReceipt = null;

        try {
          uploadedReceipt = await uploadBillReceipt(
            supabase,
            userData.user.id,
            billId,
            receiptFile,
          );

          const { data: updatedRecord, error: attachmentError } = await supabase
            .from("bills")
            .update(uploadedReceipt)
            .eq("id", billId)
            .eq("user_id", userData.user.id)
            .eq("is_paid", true)
            .select(
              "id, name, category, amount, due_date, is_paid, recurrence_id, paid_at, created_at, attachment_path, attachment_name",
            )
            .single();

          if (attachmentError) throw attachmentError;

          savedRecord = updatedRecord;

          // Elimina el comprobante anterior después de guardar el nuevo.
          if (existingBill.attachment_path) {
            const { error: removeError } = await supabase.storage
              .from(RECEIPT_BUCKET)
              .remove([existingBill.attachment_path]);

            if (removeError) {
              console.warn(
                "No se pudo eliminar el comprobante anterior:",
                removeError,
              );
            }
          }
        } catch (attachmentError) {
          console.error(
            "Error al guardar el comprobante de la cuenta:",
            attachmentError,
          );

          if (uploadedReceipt?.attachment_path) {
            const { error: cleanupError } = await supabase.storage
              .from(RECEIPT_BUCKET)
              .remove([uploadedReceipt.attachment_path]);

            if (cleanupError) {
              console.warn(
                "No se pudo limpiar el archivo nuevo:",
                cleanupError,
              );
            }
          }

          showError(
            "La cuenta se guardó, pero no se pudo adjuntar el comprobante. Puedes volver a intentarlo.",
          );
          return;
        }
      }

      const savedBill = normalizeBill(savedRecord);

      // Mantiene el estado local sincronizado con la respuesta de Supabase.
      if (billId) {
        setBills(
          getBills().map((item) =>
            item.id === savedBill.id ? savedBill : item,
          ),
        );
      } else {
        setBills([...getBills(), savedBill]);
      }

      billDialog.close();
      renderDashboard();
      notify(
        billId ? "Cuenta actualizada con éxito." : "Cuenta guardada con éxito.",
        "success",
      );
    } catch (error) {
      console.error("Error inesperado al guardar cuenta:", error);
      showError("Ocurrió un error al guardar. Revisa tu conexión.");
    } finally {
      if (billSaveButton.isConnected) {
        billSaveButton.disabled = false;
        billSaveButton.textContent = billForm.elements.namedItem("billId").value
          ? "Guardar cambios"
          : "Guardar cuenta";
      }
    }
  });
}

// ============================================================
// CIFRA
// Gestión de movimientos
// ============================================================

import { getCategoryIcon } from "../utils/icons.js";
import { notify } from "../ui/notifications.js";

// ============================================================
// COMPROBANTES Y FORMATO DE IMPORTES
// ============================================================

const RECEIPT_BUCKET = "receipt-attachments";
const MAX_RECEIPT_SIZE = 10 * 1024 * 1024;

const RECEIPT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

function validateReceipt(file) {
  if (!file || file.size === 0) return "El archivo está vacío.";

  if (!RECEIPT_TYPES.includes(file.type)) {
    return "Solo se permiten imágenes JPG, PNG, WEBP o archivos PDF.";
  }

  if (file.size > MAX_RECEIPT_SIZE) {
    return "El archivo no puede superar los 10 MB.";
  }

  return "";
}

function getReceiptExtension(file) {
  const extensions = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "application/pdf": "pdf",
  };

  return extensions[file.type];
}

async function uploadReceipt(supabase, userId, movementId, file) {
  const extension = getReceiptExtension(file);
  const path =
    `${userId}/movements/${movementId}/` +
    `${crypto.randomUUID()}.${extension}`;

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

const moneyInputFormatter = new Intl.NumberFormat("es-CL", {
  maximumFractionDigits: 0,
  useGrouping: true,
});

function formatMoneyInput(input) {
  const digits = input.value.replace(/\D/g, "");

  input.value = digits ? moneyInputFormatter.format(Number(digits)) : "";
}

// ============================================================
// NORMALIZACIÓN DE MOVIMIENTOS
// ============================================================

// Normaliza los datos del movimiento y asigna su icono.
export function mapMovement(movement) {
  return {
    ...movement,
    amount: Number(movement.amount),
    icon: getCategoryIcon(movement.category),
  };
}

export function setupMovementFeature({
  supabase,
  getMovements,
  setMovements,
  financial,
  updateFinancialTotals,
  renderDashboard,
  toDateInput,
  formatChileanDate,
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
}) {
  // ==========================================================
  // FORMULARIO Y FECHAS
  // ==========================================================

  const amountInput = form.elements.namedItem("amount");

  const attachmentField = document.querySelector("#movement-attachment");
  const attachmentCurrent = document.querySelector(
    "#movement-attachment-current",
  );
  const removeMovementAttachmentButton = document.querySelector(
    "#remove-movement-attachment",
  );

  function resetMovementAttachment() {
    attachmentField.value = "";
    attachmentCurrent.textContent = "";
    attachmentCurrent.hidden = true;
    removeMovementAttachmentButton.hidden = true;
  }

  removeMovementAttachmentButton.addEventListener("click", async () => {
    const movementId = form.elements.namedItem("movementId").value;

    const movement = getMovements().find((item) => item.id === movementId);

    if (!movement?.attachment_path || movement.bill_id) {
      return;
    }

    const confirmed = window.confirm(
      "¿Quieres quitar el comprobante de este movimiento?",
    );

    if (!confirmed) return;

    removeMovementAttachmentButton.disabled = true;

    try {
      const { data: userData, error: userError } =
        await supabase.auth.getUser();

      if (userError) throw userError;
      if (!userData.user) throw new Error("No se encontró tu sesión.");

      const oldPath = movement.attachment_path;

      const { error } = await supabase
        .from("movements")
        .update({
          attachment_path: null,
          attachment_name: null,
        })
        .eq("id", movement.id)
        .eq("user_id", userData.user.id)
        .is("bill_id", null);

      if (error) throw error;

      setMovements(
        getMovements().map((item) =>
          item.id === movement.id
            ? {
                ...item,
                attachment_path: null,
                attachment_name: null,
              }
            : item,
        ),
      );

      attachmentField.value = "";
      attachmentCurrent.textContent = "";
      attachmentCurrent.hidden = true;
      removeMovementAttachmentButton.hidden = true;

      const { error: storageError } = await supabase.storage
        .from(RECEIPT_BUCKET)
        .remove([oldPath]);

      renderDashboard();

      if (storageError) {
        console.error("No se pudo borrar el archivo:", storageError);
        notify(
          "Se quitó el comprobante del movimiento, pero no se pudo borrar el archivo almacenado.",
          "warning",
        );
        return;
      }

      notify("Comprobante quitado correctamente.", "success");
    } catch (error) {
      console.error("Error al quitar el comprobante:", error);
      window.alert(error.message || "No se pudo quitar el comprobante.");
    } finally {
      removeMovementAttachmentButton.disabled = false;
    }
  });

  amountInput.addEventListener("input", () => {
    formatMoneyInput(amountInput);
  });

  // Restaura la fecha actual en el campo de texto y el calendario.
  function setToday() {
    const currentDate = toDateInput(new Date());

    dateField.value = formatChileanDate(currentDate);
    datePicker.value = currentDate;
  }

  function closeForm() {
    dialog.close();
  }

  // Abre el formulario para crear un movimiento.
  document.querySelector("#add-movement").addEventListener("click", () => {
    form.reset();
    resetMovementAttachment();

    form.elements.namedItem("movementId").value = "";
    formTitle.textContent = "Nuevo movimiento";
    saveButton.textContent = "Guardar movimiento";

    setToday();
    errorMessage.hidden = true;

    dialog.showModal();
  });

  // Abre el selector de fecha nativo cuando el navegador lo permite.
  openDatePicker.addEventListener("click", () => {
    try {
      if (typeof datePicker.showPicker === "function") {
        datePicker.showPicker();
      } else {
        datePicker.click();
      }
    } catch {
      datePicker.click();
    }
  });

  // Actualiza el campo de texto cuando se elige una fecha del calendario.
  datePicker.addEventListener("change", () => {
    if (datePicker.value) {
      dateField.value = formatChileanDate(datePicker.value);
      errorMessage.hidden = true;
    }
  });

  // Da formato DD/MM/AAAA mientras se escribe la fecha.
  dateField.addEventListener("input", () => {
    const digits = dateField.value.replace(/\D/g, "").slice(0, 8);

    if (digits.length > 4) {
      dateField.value = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    } else if (digits.length > 2) {
      dateField.value = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    } else {
      dateField.value = digits;
    }
  });

  // Sincroniza el calendario si la fecha escrita es válida.
  dateField.addEventListener("change", () => {
    const isoDate = parseChileanDate(dateField.value);

    if (isoDate) {
      datePicker.value = isoDate;
    }
  });

  document.querySelector("#close-form").addEventListener("click", closeForm);

  document.querySelector("#cancel-form").addEventListener("click", closeForm);

  // Cierra el formulario al hacer clic fuera de su contenido.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      closeForm();
    }
  });

  // ==========================================================
  // ACCIONES SOBRE MOVIMIENTOS EXISTENTES
  // ==========================================================

  // Gestiona las acciones de editar y eliminar desde la lista.
  movementList.addEventListener("click", async (event) => {
    const button = event.target.closest("button[data-action]");

    if (!button) return;

    const movementId = button.dataset.id;
    const action = button.dataset.action;
    // Abre el comprobante guardado en Supabase Storage.
    if (action === "view-attachment") {
      const selectedMovement = getMovements().find(
        (item) => item.id === movementId,
      );

      if (!selectedMovement?.attachment_path) {
        window.alert("Este movimiento no tiene un comprobante adjunto.");
        return;
      }

      button.disabled = true;

      try {
        const { data: userData, error: userError } =
          await supabase.auth.getUser();

        if (userError || !userData.user) {
          window.alert(
            "Tu sesión no está disponible. Inicia sesión nuevamente.",
          );
          return;
        }

        const { data, error } = await supabase.storage
          .from("receipt-attachments")
          .createSignedUrl(selectedMovement.attachment_path, 60);

        if (error) throw error;

        window.open(data.signedUrl, "_blank", "noopener,noreferrer");
      } catch (error) {
        console.error("Error al abrir el comprobante:", error);
        window.alert("No se pudo abrir el comprobante. Inténtalo de nuevo.");
      } finally {
        button.disabled = false;
      }

      return;
    }

    const movement = getMovements().find((item) => item.id === movementId);

    if (movement?.bill_id) {
      alert(
        "Este movimiento pertenece a una cuenta pagada. " +
          "Para modificarlo, primero deshaz el pago desde Cuentas.",
      );
      return;
    }

    if (!movement) {
      alert(
        "No se encontró ese movimiento. Actualiza la página e inténtalo de nuevo.",
      );
      return;
    }

    // Carga los datos del movimiento seleccionado en el formulario.
    if (action === "edit") {
      form.reset();

      resetMovementAttachment();

      if (movement.attachment_path) {
        attachmentCurrent.textContent = `Comprobante actual: ${movement.attachment_name || "Archivo adjunto"}`;
        attachmentCurrent.hidden = false;
        removeMovementAttachmentButton.hidden = false;
      }

      form.elements.namedItem("movementId").value = movement.id;
      form.elements.namedItem("description").value = movement.description;
      form.elements.namedItem("category").value = movement.category;
      form.elements.namedItem("type").value = movement.type;
      form.elements.namedItem("amount").value = moneyInputFormatter.format(
        Number(movement.amount),
      );

      dateField.value = formatChileanDate(movement.date);
      datePicker.value = movement.date;

      formTitle.textContent = "Editar movimiento";
      saveButton.textContent = "Guardar cambios";
      errorMessage.hidden = true;

      dialog.showModal();
      return;
    }

    // Confirma y elimina el movimiento de Supabase.
    if (action === "delete") {
      const confirmed = window.confirm(
        `¿Quieres eliminar el movimiento "${movement.description}"? Esta acción no se puede deshacer.`,
      );

      if (!confirmed) return;

      button.disabled = true;

      try {
        const { data: userData, error: userError } =
          await supabase.auth.getUser();

        if (userError || !userData.user) {
          alert("Tu sesión no está disponible. Inicia sesión nuevamente.");
          return;
        }

        const { data, error } = await supabase
          .from("movements")
          .delete()
          .eq("id", movement.id)
          .eq("user_id", userData.user.id)
          .select("id");

        if (error) {
          console.error("Error al eliminar movimiento:", error);
          alert("No se pudo eliminar el movimiento. Inténtalo de nuevo.");
          return;
        }

        if (!data || data.length === 0) {
          alert(
            "No se eliminó ningún movimiento. Actualiza la página e inténtalo de nuevo.",
          );
          return;
        }

        const updatedMovements = getMovements().filter(
          (item) => item.id !== movement.id,
        );

        setMovements(updatedMovements);
        updateFinancialTotals(updatedMovements, financial);

        renderDashboard();
        notify("Movimiento eliminado con éxito.", "success");
      } catch (error) {
        console.error("Error inesperado al eliminar:", error);
        alert("Ocurrió un error al eliminar el movimiento.");
      } finally {
        if (button.isConnected) {
          button.disabled = false;
        }
      }
    }
  });

  // ==========================================================
  // CREACIÓN Y ACTUALIZACIÓN DE MOVIMIENTOS
  // ==========================================================

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorMessage.hidden = true;

    const formData = new FormData(form);

    const movementId = String(formData.get("movementId") || "");
    const description = String(formData.get("description") || "").trim();
    const category = String(formData.get("category") || "");
    const type = String(formData.get("type") || "");
    const amount = Number(
      String(formData.get("amount") || "").replace(/\D/g, ""),
    );
    const date = parseChileanDate(dateField.value.trim());

    const selectedFile = formData.get("attachment");
    const receiptFile =
      selectedFile instanceof File && selectedFile.size > 0
        ? selectedFile
        : null;

    if (receiptFile) {
      const receiptError = validateReceipt(receiptFile);

      if (receiptError) {
        errorMessage.textContent = receiptError;
        errorMessage.hidden = false;
        return;
      }
    }

    // Valida los campos descriptivos del movimiento.
    if (!description || description.length > 80 || !category || !type) {
      errorMessage.textContent = "Revisa la descripción y completa los campos.";
      errorMessage.hidden = false;
      return;
    }

    // Acepta únicamente importes enteros positivos dentro del límite.
    if (
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      amount > 1000000000000
    ) {
      errorMessage.textContent = "Ingresa un importe válido, mayor que cero.";
      errorMessage.hidden = false;
      return;
    }

    // La fecha debe ser válida y estar en formato DD/MM/AAAA.
    if (!date) {
      errorMessage.textContent =
        "Ingresa una fecha válida en formato DD/MM/AAAA.";
      errorMessage.hidden = false;
      dateField.focus();
      return;
    }

    if (!["income", "expense"].includes(type)) {
      errorMessage.textContent = "Selecciona un tipo de movimiento válido.";
      errorMessage.hidden = false;
      return;
    }

    saveButton.disabled = true;
    saveButton.textContent = "Guardando…";

    try {
      const { data: userData, error: userError } =
        await supabase.auth.getUser();

      if (userError || !userData.user) {
        errorMessage.textContent =
          "Tu sesión no está disponible. Inicia sesión nuevamente.";
        errorMessage.hidden = false;
        return;
      }

      const movementData = {
        description,
        category,
        amount,
        type,
        date,
      };

      // Usa la operación correspondiente según sea edición o creación.
      let request;

      if (movementId) {
        request = supabase
          .from("movements")
          .update(movementData)
          .eq("id", movementId)
          .eq("user_id", userData.user.id)
          .select(
            "id, description, category, amount, type, date, created_at, bill_id, attachment_path, attachment_name",
          )
          .single();
      } else {
        request = supabase
          .from("movements")
          .insert({
            ...movementData,
            user_id: userData.user.id,
          })
          .select(
            "id, description, category, amount, type, date, created_at, bill_id, attachment_path, attachment_name",
          )
          .single();
      }

      const { data, error } = await request;

      if (error) {
        console.error("Error al guardar movimiento:", error);
        errorMessage.textContent =
          "No se pudo guardar el movimiento. Inténtalo de nuevo.";
        errorMessage.hidden = false;
        return;
      }

      // Guarda el comprobante después de crear o actualizar el movimiento.
      let movementRecord = data;

      const previousMovement = movementId
        ? getMovements().find((item) => item.id === movementId)
        : null;

      if (receiptFile) {
        let uploadedReceipt = null;

        try {
          uploadedReceipt = await uploadReceipt(
            supabase,
            userData.user.id,
            movementRecord.id,
            receiptFile,
          );

          const { data: updatedRecord, error: attachmentError } = await supabase
            .from("movements")
            .update(uploadedReceipt)
            .eq("id", movementRecord.id)
            .eq("user_id", userData.user.id)
            .select(
              "id, description, category, amount, type, date, created_at, bill_id, attachment_path, attachment_name",
            )
            .single();

          if (attachmentError) throw attachmentError;

          movementRecord = updatedRecord;

          // Elimina el comprobante anterior solo después de guardar el nuevo.
          if (
            previousMovement?.attachment_path &&
            previousMovement.attachment_path !== uploadedReceipt.attachment_path
          ) {
            const { error: removeError } = await supabase.storage
              .from(RECEIPT_BUCKET)
              .remove([previousMovement.attachment_path]);

            if (removeError) {
              console.warn(
                "No se pudo eliminar el comprobante anterior:",
                removeError,
              );
            }
          }
        } catch (attachmentError) {
          console.error("Error al guardar el comprobante:", attachmentError);

          // Si falló la asociación en la base de datos, limpia el archivo nuevo.
          if (uploadedReceipt?.attachment_path) {
            const { error: cleanupError } = await supabase.storage
              .from(RECEIPT_BUCKET)
              .remove([uploadedReceipt.attachment_path]);

            if (cleanupError) {
              console.warn("No se pudo limpiar el archivo:", cleanupError);
            }
          }

          window.alert(
            "El movimiento se guardó, pero no se pudo adjuntar el comprobante. Puedes editarlo e intentarlo otra vez.",
          );
        }
      }

      // Normaliza la respuesta y actualiza el estado local.
      const savedMovement = mapMovement(movementRecord);
      let updatedMovements;

      if (movementId) {
        updatedMovements = getMovements().map((movement) =>
          movement.id === savedMovement.id ? savedMovement : movement,
        );
      } else {
        updatedMovements = [savedMovement, ...getMovements()];
      }

      setMovements(updatedMovements);
      updateFinancialTotals(updatedMovements, financial);

      dialog.close();
      renderDashboard();

      notify(
        movementId
          ? "Movimiento actualizado con éxito."
          : "Movimiento guardado con éxito.",
        "success",
      );

      document.querySelector("#movimientos").scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    } catch (error) {
      console.error("Error inesperado al guardar:", error);
      errorMessage.textContent =
        "Ocurrió un error al guardar. Revisa tu conexión e inténtalo de nuevo.";
      errorMessage.hidden = false;
    } finally {
      if (saveButton.isConnected) {
        saveButton.disabled = false;
        saveButton.textContent = movementId
          ? "Guardar cambios"
          : "Guardar movimiento";
      }
    }
  });
}

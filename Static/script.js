// script.js — cleaned & consolidated (updated)
document.addEventListener("DOMContentLoaded", () => {
  /* ===========================
      BASIC DOM
  ============================ */
  const main = document.querySelector(".main");
  const role = (main?.dataset.role || "user").toLowerCase();
  const userCenter = main?.dataset.userCenter || "";

  const tbody = document.getElementById("recordsTbody");
  const addRowBtn = document.getElementById("addRowBtn");
  const addFirstBtn = document.getElementById("addFirstBtn");
  const viewMoreBtn = document.getElementById("viewMoreBtn");
  const viewMoreBtns = document.querySelectorAll(".viewMoreBtn");
    viewMoreBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            const table = document.querySelector(".table-grid");

            const expanded = table.classList.toggle("show-extra");
            btn.textContent = expanded ? "View Less" : "View More";

            EXTRA_HIDDEN.forEach(col => setColumnVisibility(col, expanded));
        });
  });
  const headerSelectAll = document.getElementById("selectAllBtn");
  const exportBtn = document.getElementById("exportBtn");
  const adminCenterFilter = document.getElementById("adminCenterFilter");
  const bulkMsgEl = document.getElementById("bulkMsg");

  /* Dropdown cache */
  const cache = { families: [], children: [], centers: [] };

  /* Constants */
  const BASE_COLUMNS = [
    "Centre","Family","Child's Name","Adjustment Amount","Note/Description",
    "Pulling Category","Pulling Instructions","Start Date","End Date",
    "Adjustment is Recurring?","Approval","Child Status","Family Status","Billing Cycle"
  ];
  const EXTRA_HIDDEN = ["Child Status","Family Status","Billing Cycle"];

  /* ===========================
      UTILITIES
  ============================ */
  function qs(selector, root = document) { return root.querySelector(selector); }
  function qsa(selector, root = document) { return Array.from(root.querySelectorAll(selector)); }

  function setExportHrefForCenter(center) {
    if (!exportBtn) return;
    exportBtn.href = center ? `/export?center=${encodeURIComponent(center)}` : `/export`;
  }

  function showToast(message, type = "info", timeout = 3000) {
    const container = document.getElementById("toastContainer");
    if (!container) {
      // fallback to console if toast container not present
      console.log(`[toast:${type}] ${message}`);
      return;
    }
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    // fade in (small delay)
    requestAnimationFrame(() => toast.style.opacity = "1");
    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, timeout);
  }

  function showConfirm(message) {
    // If you have a modal in DOM, it will be used. Otherwise fallback to native confirm.
    const modal = document.getElementById("confirmModal");
    if (!modal) return Promise.resolve(confirm(message));

    return new Promise(resolve => {
      const text = document.getElementById("confirmText");
      const yes = document.getElementById("confirmYes");
      const no = document.getElementById("confirmNo");

      text.textContent = message;
      modal.classList.remove("hidden");

      const cleanup = () => {
        modal.classList.add("hidden");
        yes.removeEventListener("click", yesHandler);
        no.removeEventListener("click", noHandler);
      };

      const yesHandler = () => { cleanup(); resolve(true); };
      const noHandler = () => { cleanup(); resolve(false); };

      yes.addEventListener("click", yesHandler);
      no.addEventListener("click", noHandler);
    });
  }

  /* ===========================
      SEARCH
  ============================ */
  const searchInput = qs("#searchInput");
  if (searchInput) {
    searchInput.addEventListener("keyup", () => {
      const q = searchInput.value.trim().toLowerCase();
      qsa("#recordsTbody tr").forEach(tr => {
        tr.style.display = q === "" ? "" : (tr.innerText.toLowerCase().includes(q) ? "" : "none");
      });
    });
  }

  /* ===========================
      API HELPERS (dropdowns & child details)
  ============================ */
  async function loadDropdowns(center = "") {
    try {
      let url = "/api/children";
      if (center) url += `?center=${encodeURIComponent(center)}`;
      const r = await fetch(url);
      const j = await r.json();
      cache.families = j.families || [];
      cache.children = j.children || [];
      cache.centers = j.centers || [];
    } catch (e) {
      console.warn("loadDropdowns failed:", e);
      cache.families = cache.families || [];
      cache.children = cache.children || [];
      cache.centers = cache.centers || [];
    }
    initPagination();
  }

  async function fetchChildDetails(centre, child) {
    try {
      const res = await fetch(`/api/child_details?centre=${encodeURIComponent(centre)}&child=${encodeURIComponent(child)}`);
      return await res.json();
    } catch (e) {
      console.warn("fetchChildDetails failed:", e);
      return {};
    }
  }

  /* ===========================
      COLUMN / HEADER HELPERS
  ============================ */
  function getHeaderColumns() {
    const ths = qsa(".table-grid thead th");
    if (!ths.length) return BASE_COLUMNS.slice();

    return ths
        .map(th => th.dataset.column || th.textContent.trim())
        .filter(t => t && t.toLowerCase() !== "actions");
}

  function getVisibleColumns() {
    const cols = getHeaderColumns();
    return BASE_COLUMNS.filter(c => cols.includes(c));
  }

  function setColumnVisibility(colName, visible) {
    qsa(".table-grid thead th").forEach(th => {
      if (th.textContent.trim() === colName) {
        if (visible) th.classList.remove("hidden-col");
        else th.classList.add("hidden-col");
      }
    });
    qsa(`#recordsTbody tr`).forEach(tr => {
      const td = tr.querySelector(`td[data-key="${CSS.escape(colName)}"]`);
      if (td) {
        if (visible) td.classList.remove("hidden-col");
        else td.classList.add("hidden-col");
      }
    });
  }

  /* ===========================
      CREATE INPUTS / SELECTS
  ============================ */
  function createInput(name, value = "") {
    const el = document.createElement("input");
    el.className = "table-input";
    el.name = name;
    el.value = value ?? "";

    // Accessibility
    el.setAttribute("aria-label", name);
    el.setAttribute("title", name);
    el.setAttribute("placeholder", name);

    if (name === "Adjustment Amount") {
      el.type = "number";
      el.step = "0.01";
    } else if (name === "Start Date" || name === "End Date") {
      el.type = "date";
    } else {
      el.type = "text";
    }

    if (EXTRA_HIDDEN.includes(name)) {
      el.readOnly = true;
      el.style.background = "#f3f3f3";
    }
    if (name === "Centre" && role !== "admin") {
      el.value = userCenter;
      el.readOnly = true;
      el.style.background = "#f3f3f3";
    }
    if (name === "Approval" && role !== "admin") {
      el.value = "Pending";
      el.readOnly = true;
      el.style.background = "#f3f3f3";
    }

    return el;
  }

  function createSelect(name, options = [], value = "") {
    const sel = document.createElement("select");
    sel.className = "table-select";
    sel.name = name;

    // Accessibility
    sel.setAttribute("aria-label", name);
    sel.setAttribute("title", name);

    (options || []).forEach(opt => {
      const o = document.createElement("option");
      o.value = opt;
      o.textContent = opt;
      if (String(opt) === String(value)) o.selected = true;
      sel.appendChild(o);
    });

    return sel;
  }

  function tdWrap(control, key) {
    const td = document.createElement("td");
    td.dataset.key = key;
    if (EXTRA_HIDDEN.includes(key)) td.classList.add("hidden-col");
    td.appendChild(control);
    return td;
  }

  /* ===========================
      PULLING RULES & AUTOFILL
  ============================ */
  function applyPullingRulesToRow(tr) {
    const category = tr.querySelector('select[name="Pulling Category"]');
    const instruction = tr.querySelector('input[name="Pulling Instructions"]');
    if (!category || !instruction) return;

    const handler = () => {
      if (category.value === "Pull") {
        instruction.value = "";
        instruction.disabled = true;
        instruction.style.background = "#f3f3f3";
      } else {
        instruction.disabled = false;
        instruction.style.background = "#fff";
      }
    };

    category.addEventListener("change", handler);
    handler();
  }

async function autofillChildFieldsForRow(tr) {
    const centre = tr.querySelector('[name="Centre"]')?.value?.trim();
    let child = tr.querySelector('[name="Child\'s Name"]')?.value?.trim();

    if (!centre || !child) return;

    // 🔥 FIX: clean apostrophes/spaces before sending to API
    child = child.replace("'", "").replace(" ", "");

    const info = await fetch(`/api/child_details?centre=${encodeURIComponent(centre)}&child=${encodeURIComponent(child)}`);
    const data = await info.json();

    tr.querySelector('[name="Child Status"]').value = data["Child Status"] || "";
    tr.querySelector('[name="Family Status"]').value = data["Family Status"] || "";
    tr.querySelector('[name="Billing Cycle"]').value = data["Billing Cycle"] || "";
}

  function autofillFamilyFromChild(tr) {
  const childSel = tr.querySelector('select[name="Child\'s Name"]');
  const familySel = tr.querySelector('select[name="Family"]');

  if (!childSel || !familySel) return;

  childSel.addEventListener("change", () => {
    const child = childSel.value.trim();
    if (!child) return;

    // Child format: "Family_Child"
    const familyName = child.includes("_") ? child.split("_")[0] : child;
    familySel.value = familyName; // Autofill family
  });
}


  /* ===========================
      ROW PAYLOAD + RENDER
  ============================ */
  function collectRowPayload(tr, cols) {
    const payload = {};
    cols.forEach(k => {
      // CSS.escape is safe for attribute selectors
      const ctrl = tr.querySelector(`[name="${CSS.escape(k)}"]`);
      if (ctrl) {
        if (k === "Adjustment Amount") payload[k] = String(ctrl.value).replace('$', '').trim();
        else payload[k] = ctrl.value;
      } else {
        const td = tr.querySelector(`td[data-key="${CSS.escape(k)}"]`);
        payload[k] = td ? td.textContent.trim() : "";
      }
    });
    if (payload["Pulling Category"] === "Pull") payload["Pulling Instructions"] = "";
    return payload;
  }

  function renderRowFromPayload(tr, payload, cols) {
    // ensure ID stays attached (accept either ID or id)
    const pid = payload && (payload["ID"] || payload.id || payload["id"]);
    if (pid) tr.dataset.id = pid;

    cols.forEach(k => {
      let td = tr.querySelector(`td[data-key="${CSS.escape(k)}"]`);
      if (!td) {
        td = document.createElement("td");
        td.dataset.key = k;
        const actionsCell = tr.querySelector(".t-actions");
        if (actionsCell) tr.insertBefore(td, actionsCell);
        else tr.appendChild(td);
      }
      if (k === "Adjustment Amount") td.textContent = payload[k] ? `$${payload[k]}` : "";
      else td.textContent = payload[k] == null ? "" : String(payload[k]);
      if (EXTRA_HIDDEN.includes(k)) td.classList.add("hidden-col");
      if (k === "Centre" && role !== "admin") td.classList.add("hidden-col");
    });

    // restore action buttons (edit/delete) — ensure type and accessibility
    let act = tr.querySelector(".t-actions");
    if (!act) {
      act = document.createElement("td");
      act.className = "t-actions";
      tr.appendChild(act);
    }
    act.innerHTML = `
      <button type="button" class="t-btn icon edit" title="Edit Record" aria-label="Edit Record">
        <img src="/Static/img/edit.png" alt="Edit" />
      </button>
      <button type="button" class="t-btn icon delete" title="Delete Record" aria-label="Delete Record">
        <img src="/Static/img/delete.png" alt="Delete" />
      </button>
    `;
  }

  /* ===========================
      EVENT DELEGATION for row actions
  ============================ */
  function handleRowClick(e) {
    // find nearest button even if clicking the image inside the button
    let btn = e.target.closest("button");
    if (!btn) {
      const img = e.target.closest("img");
      if (img) btn = img.closest("button");
    }
    if (!btn) return;
    const tr = btn.closest("tr");
    if (!tr) return;

    if (btn.classList.contains("edit")) { enterEditMode(tr); return; }
    if (btn.classList.contains("delete")) {
      const id = tr.dataset.id;
      if (!id) { showToast("Missing record ID", "error"); return; }
      deleteRecord(id);
      return;
    }
    if (btn.classList.contains("save")) {
      if (tr.dataset.mode === "edit") saveEditedRow(tr);
      else if (tr.dataset.mode === "new") saveNewRow(tr);
      return;
    }
    if (btn.classList.contains("cancel")) {
      if (tr.dataset.mode === "edit" && tr.dataset.orig) {
        tr.innerHTML = tr.dataset.orig;
        delete tr.dataset.orig;
        delete tr.dataset.mode;
      } else if (tr.dataset.mode === "new") {
        tr.remove();
      }
      return;
    }
  }

  if (tbody) tbody.addEventListener("click", handleRowClick);

  /* ===========================
      EDIT MODE
  ============================ */
  function enterEditMode(tr) {
    if (!tr) return;
    if (document.querySelector('tr[data-mode="edit"], tr[data-mode="new"]')) {
      showToast("Finish current edit first.", "error"); return;
    }

    tr.dataset.mode = "edit";
    tr.dataset.orig = tr.innerHTML; // save

    const visibleCols = getVisibleColumns();
    visibleCols.forEach(k => {
      const td = tr.querySelector(`td[data-key="${CSS.escape(k)}"]`);
      if (!td) return;
      const current = td.textContent.trim();
      td.innerHTML = "";

      if (k === "Family") td.appendChild(createSelect("Family", cache.families, current));
      else if (k === "Child's Name") {
        const sel = createSelect("Child's Name", cache.children, current);
        sel.addEventListener("change", () => {
          autofillChildFieldsForRow(tr);
          autofillFamilyFromChild(tr);  // <-- NEW LINE HERE
        });
        td.appendChild(sel);
      } else if (k === "Pulling Category") td.appendChild(createSelect("Pulling Category", ["Pull","Don't Pull","Deferred pull"], current));
      else if (k === "Adjustment is Recurring?") td.appendChild(createSelect("Adjustment is Recurring?", ["Monthly","One-time"], current));
      else if (k === "Approval") {
        if (role === "admin") td.appendChild(createSelect("Approval", ["Pending","Approved","Not Approved"], current));
        else td.appendChild(createInput("Approval", current));
      } else td.appendChild(createInput(k, current));
    });

    // replace actions with save/cancel (ensure type attr)
    const act = tr.querySelector(".t-actions");
    if (act) {
      act.innerHTML = `
        <button type="button" class="t-btn icon save" title="Save" aria-label="Save">
          <img src="/Static/img/save.png" alt="Save" />
        </button>
        <button type="button" class="t-btn icon cancel" title="Cancel" aria-label="Cancel">
          <img src="/Static/img/cancel.png" alt="Cancel" />
        </button>
      `;
    }

    applyPullingRulesToRow(tr);
    const start = tr.querySelector('input[name="Start Date"]');
    const end = tr.querySelector('input[name="End Date"]');
    if (start && end) {
      start.addEventListener("change", () => {
        end.min = start.value;
        if (end.value && end.value < start.value) end.value = start.value;
      });
      if (start.value) end.min = start.value;
    }
  }

  async function saveEditedRow(tr) {
    const visibleCols = getVisibleColumns();
    const payload = collectRowPayload(tr, visibleCols);
    if (!validatePullingInstruction(tr)) return;
    const id = tr.dataset.id;
    if (!id) return showToast("Missing record ID", "error");

    const fd = new FormData();
    Object.entries(payload).forEach(([k,v]) => fd.append(k, v));
    try {
      const res = await fetch(`/records/edit/${encodeURIComponent(id)}`, { method: "POST", body: fd });
      const json = await res.json().catch(()=>({}));
      if (!res.ok || json.ok === false) return showToast(json.error || "Save failed", "error");

      // render (ensure payload contains ID if server didn't return new values)
      renderRowFromPayload(tr, Object.assign({ ID: id }, payload), visibleCols);
      delete tr.dataset.orig; delete tr.dataset.mode;
      showToast("Record saved", "success");
    } catch (e) {
      console.error("saveEditedRow error:", e);
      showToast("Save failed", "error");
    }
  }

  /* ===========================
      NEW ROW ADD / SAVE
  ============================ */
  function addEditableRowAtBottom() {
    if (!tbody) return;
    if (tbody.querySelector('tr[data-mode="new"]')) {
      showToast("Please save or cancel the current new record first.", "warn");
      return;
    }

    const visibleCols = getVisibleColumns();
    const tr = document.createElement("tr");
    tr.dataset.mode = "new";

    visibleCols.forEach(k => {
      let td;
      if (k === "Family") td = tdWrap(createSelect("Family", cache.families, ""), k);
      else if (k === "Child's Name") {
        const sel = createSelect("Child's Name", cache.children, "");
        sel.addEventListener("change", () => {
          autofillChildFieldsForRow(tr);
          autofillFamilyFromChild(tr);  // <-- NEW LINE HERE
        });
        td = tdWrap(sel, k);
      } else if (k === "Pulling Category") td = tdWrap(createSelect("Pulling Category", ["Pull","Don't Pull","Deferred pull"], "Pull"), k);
      else if (k === "Adjustment is Recurring?") td = tdWrap(createSelect("Adjustment is Recurring?", ["Monthly","One-time"], "Monthly"), k);
      else if (k === "Approval") {
        if (role === "admin") td = tdWrap(createSelect("Approval", ["Pending","Approved","Not Approved"], "Pending"), k);
        else td = tdWrap(createInput("Approval", "Pending"), k);
      } else td = tdWrap(createInput(k, (k === "Centre" && role !== "admin") ? userCenter : ""), k);

      if (k === "Centre" && role !== "admin") td.classList.add("hidden-col");
      if (!qs(".table-grid")?.classList.contains("show-extra") && EXTRA_HIDDEN.includes(k)) td.classList.add("hidden-col");

      tr.appendChild(td);
    });

    const act = document.createElement("td");
    act.className = "t-actions";
    act.innerHTML = `
      <button type="button" class="t-btn icon save" title="Save" aria-label="Save">
        <img src="/Static/img/save.png" alt="Save" />
      </button>
      <button type="button" class="t-btn icon cancel" title="Cancel" aria-label="Cancel">
        <img src="/Static/img/cancel.png" alt="Cancel" />
      </button>
    `;
    tr.appendChild(act);
    tbody.appendChild(tr);

    applyPullingRulesToRow(tr);
    const start = tr.querySelector('input[name="Start Date"]');
    const end = tr.querySelector('input[name="End Date"]');
    if (start && end) {
      start.addEventListener("change", () => {
        end.min = start.value;
        if (end.value && end.value < start.value) end.value = start.value;
      });
      if (start.value) end.min = start.value;
    }

    // focus first visible input for convenience
    const firstInput = tr.querySelector("input, select");
    if (firstInput) firstInput.focus();
  }

  function validatePullingInstruction(tr) {
    const category = tr.querySelector('select[name="Pulling Category"]')?.value;
    const instruction = tr.querySelector('input[name="Pulling Instructions"]');
    if (!category || !instruction) return true;
    if (category !== "Pull" && !instruction.disabled) {
      if (instruction.value.trim() === "") {
        showToast("Pulling Instructions are required for this category.", "error");
        return false;
      }
    }
    return true;
  }

  async function saveNewRow(tr) {
    const visibleCols = getVisibleColumns();
    const payload = collectRowPayload(tr, visibleCols);
    if (!validatePullingInstruction(tr)) return;
    const fd = new FormData();
    Object.entries(payload).forEach(([k,v]) => fd.append(k, v));
    try {
      const r = await fetch("/records/add", { method: "POST", body: fd });
      const j = await r.json().catch(()=>({}));
      if (!r.ok || j.ok === false) {
        alert(j.error || "Save failed");
        return;
      }

      // server may return the created record object (we support several shapes)
      const rec = j.record || j;
      const newId = rec && (rec.ID || rec.id || rec["id"]);
      if (newId) tr.dataset.id = newId;

      // Render returned values (if provided) so UI reflects actual saved data
      if (rec) renderRowFromPayload(tr, rec, visibleCols);

      // final step: reload to get stable table state (or you may remove reload if you prefer)
      location.reload();
    } catch (e) {
      console.error("saveNewRow error:", e);
      alert("Save failed");
    }
  }

  /* ===========================
      DELETE
  ============================ */
  async function deleteRecord(id) {
    if (!(await showConfirm("Delete this record?"))) return;

    try {
      const r = await fetch(`/records/delete/${encodeURIComponent(id)}`, { method: "POST" });

      if (r.ok) {
        showToast("Record deleted", "success");
        location.reload();
      } else {
        const j = await r.json().catch(()=>({}));
        showToast(j.error || "Delete failed", "error");
      }

    } catch (e) {
      console.error("deleteRecord error:", e);
      alert("Delete failed");
    }
  }

  /* ===========================
      VIEW MORE / VIEW LESS
  ============================ */
  if (viewMoreBtn) {
    viewMoreBtn.addEventListener("click", () => {
      const table = qs(".table-grid");
      if (!table) return;
      const expanded = table.classList.toggle("show-extra");
      viewMoreBtn.textContent = expanded ? "View Less" : "View More";
      EXTRA_HIDDEN.forEach(col => setColumnVisibility(col, expanded));
    });
  }

  /* ===========================
      SELECT-ALL checkbox
  ============================ */
  if (headerSelectAll) {
    headerSelectAll.addEventListener("change", () => {
      const checked = headerSelectAll.checked;
      qsa(".row-select").forEach(cb => { cb.checked = checked; });
    });
  }

  /* ===========================
      BULK APPROVAL (admin)
  ============================ */
  function showBulkMsg(message, cls = "") {
    if (!bulkMsgEl) return;
    bulkMsgEl.textContent = message;
    bulkMsgEl.className = cls ? `bulk-message ${cls}` : "bulk-message";
  }

  async function bulkUpdate(status) {
    const visible = qsa("#recordsTbody tr").filter(tr => tr.style.display !== "none");
    const selected = visible.filter(tr => {
      const cb = tr.querySelector(".row-select");
      return cb && cb.checked;
    });

    if (!selected.length) { showBulkMsg("Please select at least one visible record.", "error"); return; }

    let target = selected;
    if (status === "Approved") {
      target = selected.filter(tr => {
        const ap = tr.querySelector('[data-key="Approval"]');
        if (!ap) return false;
        return ap.textContent.trim().toLowerCase() === "pending";
      });
      if (!target.length) { showBulkMsg("No pending records in selection.", "error"); return; }
    }

    const ids = target.map(t => t.dataset.id).filter(Boolean);
    if (!ids.length) { showBulkMsg("No valid records selected.", "error"); return; }

    showBulkMsg("Updating...", "info");
    try {
      const res = await fetch("/records/bulk_approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, status })
      });
      const json = await res.json().catch(()=>({}));
      if (json.ok) {
        showBulkMsg(`${json.updated} updated.`, "success");
        setTimeout(()=> location.reload(), 900);
      } else {
        showBulkMsg(json.error || "Failed to update", "error");
      }
    } catch (e) {
      console.error("bulkUpdate error:", e);
      showBulkMsg("Error updating records", "error");
    }
  }

  const btnPending = qs("#setPendingBtn");
  const btnApproved = qs("#setApprovedBtn");
  const btnNotApproved = qs("#setNotApprovedBtn");
  if (btnPending) btnPending.addEventListener("click", () => bulkUpdate("Pending"));
  if (btnApproved) btnApproved.addEventListener("click", () => bulkUpdate("Approved"));
  if (btnNotApproved) btnNotApproved.addEventListener("click", () => bulkUpdate("Not Approved"));

  /* ===========================
      ADMIN CENTER FILTER → reload + export update
  ============================ */
  if (adminCenterFilter) {
    adminCenterFilter.addEventListener("change", () => {
      const selected = adminCenterFilter.value;
      setExportHrefForCenter(selected);
      const url = selected ? `/dashboard?center=${encodeURIComponent(selected)}` : `/dashboard`;
      window.location.href = url;
    });
  }

  const params = new URLSearchParams(window.location.search);
  const pageCenter = params.get("center");
  if (pageCenter) setExportHrefForCenter(pageCenter);

  /* ===========================
      INIT
  ============================ */
  if (addRowBtn && role !== "admin") addRowBtn.addEventListener("click", addEditableRowAtBottom);
  if (addFirstBtn && role !== "admin") addFirstBtn.addEventListener("click", () => {
    qs("#emptyState")?.classList.add("hidden");
    addEditableRowAtBottom();
  });

  loadDropdowns(role === "admin" ? "" : userCenter).catch(()=>{});

  const table = qs(".table-grid");
  const expanded = table?.classList.contains("show-extra");
  EXTRA_HIDDEN.forEach(c => setColumnVisibility(c, !!expanded));
  if (role !== "admin") setColumnVisibility("Centre", false);

  // expose helpers for debugging
  window._tle = {
    addEditableRowAtBottom,
    saveNewRow,
    saveEditedRow,
    renderRowFromPayload
  };
  /* ===========================
      PAGINATION
=========================== */
let rowsPerPage = 10;
let currentPage = 1;

function renderTablePage() {
    const rows = Array.from(document.querySelectorAll("#recordsTbody tr"));
    const start = (currentPage - 1) * rowsPerPage;
    const end = currentPage * rowsPerPage;

    rows.forEach((row, index) => {
        row.style.display = (index >= start && index < end) ? "" : "none";
    });

    renderPagination(rows.length);
    updateNavButtons(rows.length);
}

function renderPagination(totalRows) {
    const pagination = document.getElementById("pagination");
    if (!pagination) return;

    pagination.innerHTML = "";

    const totalPages = Math.ceil(totalRows / rowsPerPage);

    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement("button");
        btn.textContent = i;

        if (i === currentPage) btn.classList.add("active");

        btn.addEventListener("click", () => {
            currentPage = i;
            renderTablePage();
        });

        pagination.appendChild(btn);
    }
}

function updateNavButtons(totalRows) {
    const totalPages = Math.ceil(totalRows / rowsPerPage);
    const prevBtn = document.getElementById("prevPage");
    const nextBtn = document.getElementById("nextPage");

    if (prevBtn) prevBtn.disabled = currentPage === 1;
    if (nextBtn) nextBtn.disabled = currentPage === totalPages;
}

document.getElementById("nextPage")?.addEventListener("click", () => {
    const totalRows = document.querySelectorAll("#recordsTbody tr").length;
    const totalPages = Math.ceil(totalRows / rowsPerPage);

    if (currentPage < totalPages) currentPage++;
    renderTablePage();
});

document.getElementById("prevPage")?.addEventListener("click", () => {
    if (currentPage > 1) currentPage--;
    renderTablePage();
});

document.getElementById("rowsPerPageSelect")?.addEventListener("change", (e) => {
    rowsPerPage = parseInt(e.target.value);
    currentPage = 1;
    renderTablePage();
});

window.initPagination = function () {
    currentPage = 1;
    renderTablePage();
};

const statusFilter = document.getElementById("statusFilter");

if (statusFilter) {
    statusFilter.addEventListener("change", () => {
        const selected = statusFilter.value.toLowerCase();

        document.querySelectorAll("#recordsTbody tr").forEach(row => {
            const approvalCell = row.querySelector('[data-key="Approval"]');
            const rowStatus = approvalCell ? approvalCell.textContent.trim().toLowerCase() : "";

            if (!selected || rowStatus === selected) {
                row.style.display = "";
            } else {
                row.style.display = "none";
            }
        });
    });
}

function sortTable(column, type) {
    const tbody = document.getElementById("recordsTbody");
    const rows = Array.from(tbody.querySelectorAll("tr"));

    const isAsc = !tbody.dataset.sortOrder || tbody.dataset.sortOrder === "desc";
    tbody.dataset.sortOrder = isAsc ? "asc" : "desc";

    rows.sort((a, b) => {
        let aValue, bValue;

        if (column === "amount") {
            aValue = parseFloat(a.querySelector('[data-key="Adjustment Amount"]').innerText.replace("$", "")) || 0;
            bValue = parseFloat(b.querySelector('[data-key="Adjustment Amount"]').innerText.replace("$", "")) || 0;
        } 
        
        else if (column === "child") {
            aValue = a.querySelector('[data-key="Child\'s Name"]').innerText.toLowerCase();
            bValue = b.querySelector('[data-key="Child\'s Name"]').innerText.toLowerCase();
        }

        if (aValue < bValue) return isAsc ? -1 : 1;
        if (aValue > bValue) return isAsc ? 1 : -1;
        return 0;
    });

    // Clear and re-add sorted rows
    tbody.innerHTML = "";
    rows.forEach(row => tbody.appendChild(row));

    // Update header UI
    document.querySelectorAll(".sortable").forEach(th => th.classList.remove("asc", "desc"));
    const activeHeader = document.querySelector(`.sortable[data-sort="${column}"]`);
    if (activeHeader) activeHeader.classList.add(isAsc ? "asc" : "desc");
}
document.querySelectorAll(".sortable").forEach(th => {
    th.addEventListener("click", () => {
        sortTable(th.dataset.sort);
    });
});

});

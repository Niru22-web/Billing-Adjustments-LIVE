// script.js — cleaned & consolidated (updated)
document.addEventListener("DOMContentLoaded", () => {

  /* ===========================
      CONSTANTS (NEED FIRST)
  ============================ */
  const BASE_COLUMNS = [
    "Centre", "Family", "Child's Name", "Adjustment Amount",
    "Note/Description", "Pulling Category", "Pulling Instructions",
    "Start Date", "End Date", "Adjustment is Recurring?",
    "Approval", "Child Status", "Family Status", "Billing Cycle"
  ];

  const EXTRA_HIDDEN = ["Child Status", "Family Status", "Billing Cycle"];

  /* Dropdown cache */
  const cache = { families: [], children: [], centers: [] };

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
  const headerSelectAll = document.getElementById("selectAllBtn");
  const exportBtn = document.getElementById("exportBtn");
  const adminCenterFilter = document.getElementById("adminCenterFilter");
  const bulkMsgEl = document.getElementById("bulkMsg");

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
      console.log(`[toast:${type}] ${message}`);
      return;
    }
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    requestAnimationFrame(() => toast.style.opacity = "1");

    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, timeout);
  }

  function showConfirm(message) {
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
        tr.style.display = q === "" ? "" :
          (tr.innerText.toLowerCase().includes(q) ? "" : "none");
      });
    });
  }

  /* ===========================
      API HELPERS
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
      cache.families = [];
      cache.children = [];
      cache.centers = [];
    }

    initPagination();
  }

  /* ===========================
      HEADER HELPERS
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

    qsa("#recordsTbody tr").forEach(tr => {
      const td = tr.querySelector(`td[data-key="${CSS.escape(colName)}"]`);
      if (td) {
        if (visible) td.classList.remove("hidden-col");
        else td.classList.add("hidden-col");
      }
    });
  }

  /* ===========================
      CREATE INPUT / SELECT
  ============================ */
  function createInput(name, value = "") {
    const el = document.createElement("input");
    el.className = "table-input";
    el.name = name;
    el.value = value ?? "";

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

    // FAMILY ALWAYS READ-ONLY
    if (name === "Family") {
      el.readOnly = true;
      el.disabled = true;          // user can't change
      el.style.background = "#f3f3f3";
      el.style.pointerEvents = "none";
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
      PULLING RULES
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
        instruction.style.background = "#ffffff";
      }
    };

    category.addEventListener("change", handler);
    handler();
  }

  /* ===========================
      AUTOFILL CHILD DETAILS
  ============================ */
  async function autofillChildFieldsForRow(tr) {
    const centre = tr.querySelector('[name="Centre"]')?.value?.trim();
    const child = tr.querySelector('[name="Child\'s Name"]')?.value?.trim();

    if (!centre || !child) return;

    try {
        const res = await fetch(
          `/api/child_details?centre=${encodeURIComponent(centre)}&child=${encodeURIComponent(child)}`
        );

        const data = await res.json();

        tr.querySelector('[name="Family"]').value = data["Family"] || "";
        tr.querySelector('[name="Child Status"]').value = data["Child Status"] || "";
        tr.querySelector('[name="Family Status"]').value = data["Family Status"] || "";
        tr.querySelector('[name="Billing Cycle"]').value = data["Billing Cycle"] || "";

    } catch (e) {
        console.warn("Failed autofill:", e);
    }
}

  /* ===========================
      COLLECT PAYLOAD
  ============================ */
  function collectRowPayload(tr, cols) {
    const payload = {};

    cols.forEach(k => {
      const ctrl = tr.querySelector(`[name="${CSS.escape(k)}"]`);
      if (ctrl) {
        if (k === "Adjustment Amount") {
          payload[k] = String(ctrl.value).replace('$', '').trim();
        } else {
          payload[k] = ctrl.value;
        }
      } else {
        const td = tr.querySelector(`td[data-key="${CSS.escape(k)}"]`);
        payload[k] = td ? td.textContent.trim() : "";
      }
    });

    if (payload["Pulling Category"] === "Pull")
      payload["Pulling Instructions"] = "";

    return payload;
  }

  /* ===========================
      RENDER BACK TO NORMAL MODE
  ============================ */
  function renderRowFromPayload(tr, payload, cols) {
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

      if (k === "Adjustment Amount")
        td.textContent = payload[k] ? `$${payload[k]}` : "";
      else
        td.textContent = payload[k] == null ? "" : String(payload[k]);

      if (EXTRA_HIDDEN.includes(k)) td.classList.add("hidden-col");
      if (k === "Centre" && role !== "admin") td.classList.add("hidden-col");
    });

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
      ROW ACTION HANDLER
  ============================ */
  function handleRowClick(e) {
    const btn = e.target.closest("button");
    if (!btn) return;

    const tr = btn.closest("tr");
    if (!tr) return;

    if (btn.classList.contains("edit")) return enterEditMode(tr);
    if (btn.classList.contains("delete")) return deleteRecord(tr.dataset.id);

    if (btn.classList.contains("save")) {
      if (tr.dataset.mode === "edit") return saveEditedRow(tr);
      if (tr.dataset.mode === "new") return saveNewRow(tr);
    }

    if (btn.classList.contains("cancel")) {
      if (tr.dataset.mode === "edit" && tr.dataset.orig) {
        tr.innerHTML = tr.dataset.orig;
        delete tr.dataset.orig;
        delete tr.dataset.mode;
      } else if (tr.dataset.mode === "new") {
        tr.remove();
      }
    }
  }

  if (tbody) tbody.addEventListener("click", handleRowClick);

  /* ===========================
      EDIT MODE
  ============================ */
  function enterEditMode(tr) {
    if (!tr) return;

    if (document.querySelector('tr[data-mode="edit"], tr[data-mode="new"]')) {
      showToast("Finish current edit first.", "error");
      return;
    }

    tr.dataset.mode = "edit";
    tr.dataset.orig = tr.innerHTML;

    const visibleCols = getVisibleColumns();

    visibleCols.forEach(k => {
      const td = tr.querySelector(`td[data-key="${CSS.escape(k)}"]`);
      if (!td) return;

      const current = td.textContent.trim();
      td.innerHTML = "";

      if (k === "Family") {
        td.appendChild(createInput("Family", current)); // read-only
      }

      else if (k === "Child's Name") {
        const sel = createSelect("Child's Name", cache.children, current);
        sel.addEventListener("change", () => autofillChildFieldsForRow(tr));
        td.appendChild(sel);
      }

      else if (k === "Pulling Category") {
        td.appendChild(
          createSelect("Pulling Category",
            ["Pull", "Don't Pull", "Deferred pull"], current)
        );
      }

      else if (k === "Adjustment is Recurring?") {
        td.appendChild(
          createSelect("Adjustment is Recurring?",
            ["Monthly", "One-time"], current)
        );
      }

      else if (k === "Approval") {
        if (role === "admin")
          td.appendChild(createSelect("Approval",
            ["Pending", "Approved", "Not Approved"], current));
        else
          td.appendChild(createInput("Approval", current));
      }

      else {
        td.appendChild(createInput(k, current));
      }
    });

    const act = tr.querySelector(".t-actions");
    if (act) {
      act.innerHTML = `
        <button type="button" class="t-btn icon save">
          <img src="/Static/img/save.png">
        </button>
        <button type="button" class="t-btn icon cancel">
          <img src="/Static/img/cancel.png">
        </button>
      `;
    }

    applyPullingRulesToRow(tr);

    const start = tr.querySelector('input[name="Start Date"]');
    const end = tr.querySelector('input[name="End Date"]');

    if (start && end) {
      start.addEventListener("change", () => {
        end.min = start.value;
        if (end.value < start.value) end.value = start.value;
      });
      if (start.value) end.min = start.value;
    }
  }

  /* ===========================
      SAVE EDITED ROW
  ============================ */
  async function saveEditedRow(tr) {
    const visibleCols = getVisibleColumns();
    const payload = collectRowPayload(tr, visibleCols);

    if (!validatePullingInstruction(tr)) return;

    const id = tr.dataset.id;
    if (!id) return showToast("Missing ID", "error");

    const fd = new FormData();
    Object.entries(payload).forEach(([k, v]) => fd.append(k, v));

    try {
      const res = await fetch(`/records/edit/${encodeURIComponent(id)}`, {
        method: "POST",
        body: fd
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok || json.ok === false)
        return showToast(json.error || "Save failed", "error");

      renderRowFromPayload(tr, { ID: id, ...payload }, visibleCols);
      delete tr.dataset.orig;
      delete tr.dataset.mode;

      showToast("Record saved", "success");

    } catch (e) {
      console.error("saveEditedRow", e);
      showToast("Save failed", "error");
    }
  }

  /* ===========================
      ADD NEW ROW
  ============================ */
  function addEditableRowAtBottom() {
    if (!tbody) return;

    if (tbody.querySelector('tr[data-mode="new"]')) {
      showToast("Please save/cancel current new row first.", "error");
      return;
    }

    const tr = document.createElement("tr");
    tr.dataset.mode = "new";

    const visibleCols = getVisibleColumns();

    visibleCols.forEach(k => {
      let td;

      if (k === "Family") {
        td = tdWrap(createInput("Family", ""), k);  // read-only
      }

      else if (k === "Child's Name") {
        const sel = createSelect("Child's Name", cache.children, "");
        sel.addEventListener("change", () => autofillChildFieldsForRow(tr));
        td = tdWrap(sel, k);
      }

      else if (k === "Pulling Category") {
        td = tdWrap(
          createSelect("Pulling Category",
            ["Pull", "Don't Pull", "Deferred pull"], "Pull"),
          k
        );
      }

      else if (k === "Adjustment is Recurring?") {
        td = tdWrap(
          createSelect("Adjustment is Recurring?",
            ["Monthly", "One-time"], "Monthly"),
          k
        );
      }

      else if (k === "Approval") {
        if (role === "admin") {
          td = tdWrap(
            createSelect("Approval",
              ["Pending", "Approved", "Not Approved"], "Pending"),
            k
          );
        } else {
          td = tdWrap(createInput("Approval", "Pending"), k);
        }
      }

      else {
        td = tdWrap(
          createInput(
            k,
            (k === "Centre" && role !== "admin") ? userCenter : ""
          ),
          k
        );
      }

      if (k === "Centre" && role !== "admin") td.classList.add("hidden-col");
      if (!qs(".table-grid")?.classList.contains("show-extra")
          && EXTRA_HIDDEN.includes(k))
        td.classList.add("hidden-col");

      tr.appendChild(td);
    });

    const act = document.createElement("td");
    act.className = "t-actions";
    act.innerHTML = `
      <button type="button" class="t-btn icon save">
        <img src="/Static/img/save.png">
      </button>
      <button type="button" class="t-btn icon cancel">
        <img src="/Static/img/cancel.png">
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
        if (end.value < start.value) end.value = start.value;
      });
    }

    const firstInput = tr.querySelector("input, select");
    if (firstInput) firstInput.focus();
  }

  /* ===========================
      VALIDATION
  ============================ */
  function validatePullingInstruction(tr) {
    const category = tr.querySelector('select[name="Pulling Category"]')?.value;
    const instruction = tr.querySelector('input[name="Pulling Instructions"]');

    if (!category || !instruction) return true;

    if (category !== "Pull" && !instruction.disabled) {
      if (instruction.value.trim() === "") {
        showToast("Pulling Instructions required.", "error");
        return false;
      }
    }
    return true;
  }

  /* ===========================
      SAVE NEW ROW
  ============================ */
  async function saveNewRow(tr) {
    const visibleCols = getVisibleColumns();
    const payload = collectRowPayload(tr, visibleCols);

    if (!validatePullingInstruction(tr)) return;

    const fd = new FormData();
    Object.entries(payload).forEach(([k, v]) => fd.append(k, v));

    try {
      const r = await fetch("/records/add", {
        method: "POST",
        body: fd
      });

      const json = await r.json().catch(() => ({}));

      if (!r.ok || json.ok === false) {
        alert(json.error || "Save failed");
        return;
      }

      const rec = json.record || json;
      const newId = rec?.ID || rec?.id;

      if (newId) tr.dataset.id = newId;
      if (rec) renderRowFromPayload(tr, rec, visibleCols);

      location.reload();

    } catch (e) {
      console.error("saveNewRow", e);
      alert("Save failed");
    }
  }

  /* ===========================
      DELETE ROW
  ============================ */
  async function deleteRecord(id) {
    if (!id) return showToast("Missing ID", "error");

    if (!(await showConfirm("Delete this record?"))) return;

    try {
      const r = await fetch(`/records/delete/${encodeURIComponent(id)}`, {
        method: "POST"
      });

      if (r.ok) {
        showToast("Record deleted", "success");
        location.reload();
      } else {
        const json = await r.json().catch(() => ({}));
        showToast(json.error || "Delete failed", "error");
      }

    } catch (e) {
      console.error("deleteRecord", e);
      alert("Delete failed");
    }
  }

  /* ===========================
      VIEW MORE / LESS
  ============================ */
  if (viewMoreBtn) {
    viewMoreBtn.addEventListener("click", () => {
      const table = qs(".table-grid");
      const expanded = table.classList.toggle("show-extra");

      viewMoreBtn.textContent = expanded ? "View Less" : "View More";

      EXTRA_HIDDEN.forEach(col => setColumnVisibility(col, expanded));
    });
  }

  // also handle any .viewMoreBtn instances
  viewMoreBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const table = document.querySelector(".table-grid");
      const expanded = table.classList.toggle("show-extra");
      btn.textContent = expanded ? "View Less" : "View More";
      EXTRA_HIDDEN.forEach(col => setColumnVisibility(col, expanded));
    });
  });

  /* ===========================
      SELECT ALL (ADMIN)
  ============================ */
  if (headerSelectAll) {
    headerSelectAll.addEventListener("change", () => {
      const checked = headerSelectAll.checked;
      qsa(".row-select").forEach(cb => cb.checked = checked);
    });
  }

  /* ===========================
      BULK UPDATE
  ============================ */
  function showBulkMsg(msg, cls = "") {
    if (!bulkMsgEl) return;
    bulkMsgEl.textContent = msg;
    bulkMsgEl.className = cls ? `bulk-message ${cls}` : "bulk-message";
  }

  async function bulkUpdate(status) {
    const visible = qsa("#recordsTbody tr")
      .filter(tr => tr.style.display !== "none");

    const selected = visible.filter(tr => {
      const cb = tr.querySelector(".row-select");
      return cb && cb.checked;
    });

    if (!selected.length) {
      return showBulkMsg("Select at least one record.", "error");
    }

    let target = selected;

    if (status === "Approved") {
      target = selected.filter(tr => {
        const ap = tr.querySelector('[data-key="Approval"]');
        return ap && ap.textContent.trim().toLowerCase() === "pending";
      });
      if (!target.length) {
        return showBulkMsg("No pending records selected.", "error");
      }
    }

    const ids = target.map(t => t.dataset.id).filter(Boolean);

    showBulkMsg("Updating...", "info");

    try {
      const res = await fetch("/records/bulk_approval", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, status })
      });

      const json = await res.json().catch(() => ({}));

      if (json.ok) {
        showBulkMsg(`${json.updated} updated.`, "success");
        setTimeout(() => location.reload(), 900);
      } else {
        showBulkMsg(json.error || "Failed", "error");
      }

    } catch (e) {
      console.error("bulkUpdate", e);
      showBulkMsg("Error updating", "error");
    }
  }

  const btnPending = qs("#setPendingBtn");
  const btnApproved = qs("#setApprovedBtn");
  const btnNotApproved = qs("#setNotApprovedBtn");

  if (btnPending) btnPending.addEventListener("click", () => bulkUpdate("Pending"));
  if (btnApproved) btnApproved.addEventListener("click", () => bulkUpdate("Approved"));
  if (btnNotApproved) btnNotApproved.addEventListener("click", () => bulkUpdate("Not Approved"));

  /* ===========================
      ADMIN CENTER FILTER
  ============================ */
  if (adminCenterFilter) {
    adminCenterFilter.addEventListener("change", () => {
      const selected = adminCenterFilter.value;

      setExportHrefForCenter(selected);

      const url = selected
        ? `/dashboard?center=${encodeURIComponent(selected)}`
        : `/dashboard`;

      window.location.href = url;
    });
  }

  const params = new URLSearchParams(window.location.search);
  const pageCenter = params.get("center");
  if (pageCenter) setExportHrefForCenter(pageCenter);

  /* ===========================
      INIT BUTTON ACTIONS
  ============================ */
  if (addRowBtn && role !== "admin") addRowBtn.addEventListener("click", addEditableRowAtBottom);

  if (addFirstBtn && role !== "admin") {
    addFirstBtn.addEventListener("click", () => {
      qs("#emptyState")?.classList.add("hidden");
      addEditableRowAtBottom();
    });
  }

  loadDropdowns(role === "admin" ? "" : userCenter).catch(() => {});

  const table = qs(".table-grid");
  const expanded = table?.classList.contains("show-extra");

  EXTRA_HIDDEN.forEach(c => setColumnVisibility(c, !!expanded));
  if (role !== "admin") setColumnVisibility("Centre", false);

  window._tle = {
    addEditableRowAtBottom,
    saveNewRow,
    saveEditedRow,
    renderRowFromPayload
  };

  /* ===========================
      PAGINATION
  ============================ */
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
    rowsPerPage = parseInt(e.target.value, 10);
    currentPage = 1;
    renderTablePage();
  });

  window.initPagination = function () {
    currentPage = 1;
    renderTablePage();
  };

  /* ===========================
      STATUS FILTER
  ============================ */
  const statusFilter = document.getElementById("statusFilter");

  if (statusFilter) {
    statusFilter.addEventListener("change", () => {
      const selected = statusFilter.value.toLowerCase();

      document.querySelectorAll("#recordsTbody tr").forEach(row => {
        const approvalCell = row.querySelector('[data-key="Approval"]');
        const rowStatus = approvalCell
          ? approvalCell.textContent.trim().toLowerCase()
          : "";

        if (!selected || rowStatus === selected) {
          row.style.display = "";
        } else {
          row.style.display = "none";
        }
      });
    });
  }

  /* ===========================
      SORTING (Amount / Child)
  ============================ */
  function sortTable(column) {
    const tbody = document.getElementById("recordsTbody");
    const rows = Array.from(tbody.querySelectorAll("tr"));

    const isAsc = !tbody.dataset.sortOrder || tbody.dataset.sortOrder === "desc";
    tbody.dataset.sortOrder = isAsc ? "asc" : "desc";

    rows.sort((a, b) => {
      let aValue, bValue;

      if (column === "amount") {
        aValue = parseFloat(
          a.querySelector('[data-key="Adjustment Amount"]').innerText.replace("$", "")
        ) || 0;
        bValue = parseFloat(
          b.querySelector('[data-key="Adjustment Amount"]').innerText.replace("$", "")
        ) || 0;
      }

      else if (column === "child") {
        aValue = a.querySelector('[data-key="Child\'s Name"]').innerText.toLowerCase();
        bValue = b.querySelector('[data-key="Child\'s Name"]').innerText.toLowerCase();
      }

      if (aValue < bValue) return isAsc ? -1 : 1;
      if (aValue > bValue) return isAsc ? 1 : -1;
      return 0;
    });

    tbody.innerHTML = "";
    rows.forEach(row => tbody.appendChild(row));

    document.querySelectorAll(".sortable").forEach(th =>
      th.classList.remove("asc", "desc")
    );

    const activeHeader = document.querySelector(
      `.sortable[data-sort="${column}"]`
    );

    if (activeHeader)
      activeHeader.classList.add(isAsc ? "asc" : "desc");
  }

  document.querySelectorAll(".sortable").forEach(th => {
    th.addEventListener("click", () => sortTable(th.dataset.sort));
  });

});

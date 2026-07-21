/* ===================================================================
   DEPARTMENTS ROSTER VIEW
   Renders department cards from GET /api/departments (shared for the
   whole unit, stored in D1). Membership is live-linked: the server
   resolves each member's current rank/name fresh on every load, so a
   promotion or reassignment shows up automatically. Every officer can
   view; add/edit/delete controls appear only for Regimental Command,
   saved via PUT /api/departments.
   =================================================================== */

// Local key-art / icon assets, keyed by department name (see assets/img/departments/).
const DEPARTMENT_ART = {
  SQUAD: { file: "squad.jpg", mode: "art" },
  ENLISTED: { file: "enlisted.jpg", mode: "art" },
  "HELLDIVERS 2": { file: "helldivers-2.jpg", mode: "art" },
  "HELL LET LOOSE": { file: "hell-let-loose.jpg", mode: "art" },
  "WAR THUNDER": { file: "war-thunder.jpg", mode: "art" },
  BATTLEFIELD: { file: "battlefield.jpg", mode: "art" },
  "LOGISTICS (TECH)": { file: "logistics.svg", mode: "icon" },
  MEDIA: { file: "media.svg", mode: "icon" },
  "SQUAD SERVER": { file: "squad-server.svg", mode: "icon" },
};

let state = null; // full GET /api/departments response

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child) node.appendChild(child);
  }
  return node;
}

function officerTag(member) {
  return member.rankCode ? `[${member.rankCode}] ${member.displayName}` : member.displayName;
}

async function persist(root, nextDepartments, nextCategoryMap) {
  try {
    await apiFetch("/api/departments", {
      method: "PUT",
      body: { departments: nextDepartments, categoryMap: nextCategoryMap },
    });
    state = await apiFetch("/api/departments");
  } catch (err) {
    alert(err.message);
    state = await apiFetch("/api/departments");
  }
  renderDepartments(root);
}

// Departments as stored server-side ({officerId, role}), rebuilt from the
// currently-displayed (resolved) state — used as the base for edits.
function rawDepartments() {
  const raw = {};
  for (const [name, members] of Object.entries(state.departments)) {
    raw[name] = members.map((m) => ({ officerId: m.officerId, role: m.role }));
  }
  return raw;
}

function createDepartmentCard(root, name, members) {
  const art = DEPARTMENT_ART[name];
  const cardAttrs = { class: art ? `dept-card dept-card--${art.mode}` : "dept-card" };
  const card = el("article", cardAttrs, [
    el("div", { class: "dept-card__header" }, [
      el("h2", { text: name }),
      state.canEdit
        ? el("div", { class: "dept-card__header-actions" }, [
            el("button", { class: "dept-card__small-button", type: "button", text: "Edit" }),
            el("button", { class: "dept-card__small-button dept-card__small-button--danger", type: "button", text: "Delete" }),
            el("button", { class: "dept-card__button", type: "button", text: "Add Member" }),
          ])
        : null,
    ]),
    el("table", { class: "dept-table" }, [
      el("thead", {}, [
        el("tr", {}, [
          el("th", { text: "Role" }),
          el("th", { text: "Name" }),
          state.canEdit ? el("th", { text: "" }) : null,
        ]),
      ]),
      el(
        "tbody",
        {},
        members.length > 0
          ? members.map((member, index) =>
              el("tr", {}, [
                el("td", { class: "dept-table__rank", text: member.role }),
                el("td", { class: "dept-table__name", text: officerTag(member) }),
                state.canEdit
                  ? el("td", {}, [
                      el("div", { class: "dept-table__actions" }, [
                        el("button", { class: "dept-table__edit", type: "button", text: "Edit" }),
                        el("button", { class: "dept-table__delete", type: "button", text: "Delete" }),
                      ]),
                    ])
                  : null,
              ])
            )
          : [
              el("tr", {}, [
                el("td", { class: "dept-table__empty", colspan: state.canEdit ? "3" : "2", text: "No staff assigned yet." }),
              ]),
            ]
      ),
    ]),
  ]);

  if (art) card.style.setProperty("--dept-bg-image", `url("/assets/img/departments/${art.file}")`);

  if (!state.canEdit) return card;

  card.querySelector(".dept-card__header-actions button:nth-child(1)").addEventListener("click", () => {
    const modal = createDepartmentModal(name, state.categoryMap[name], (updated) => {
      const nextDepartments = rawDepartments();
      const nextCategoryMap = { ...state.categoryMap };
      if (updated.name !== name) {
        if (nextDepartments[updated.name]) return alert("A department with that name already exists.");
        nextDepartments[updated.name] = nextDepartments[name];
        delete nextDepartments[name];
        delete nextCategoryMap[name];
      }
      nextCategoryMap[updated.name] = updated.category;
      persist(root, nextDepartments, nextCategoryMap);
    });
    root.appendChild(modal);
  });

  card.querySelector(".dept-card__header-actions button:nth-child(2)").addEventListener("click", () => {
    if (!confirm(`Delete department "${name}" and all its members? This cannot be undone.`)) return;
    const nextDepartments = rawDepartments();
    const nextCategoryMap = { ...state.categoryMap };
    delete nextDepartments[name];
    delete nextCategoryMap[name];
    persist(root, nextDepartments, nextCategoryMap);
  });

  card.querySelector(".dept-card__button").addEventListener("click", () => {
    const modal = createMemberModal(name, null, (member) => {
      const nextDepartments = rawDepartments();
      nextDepartments[name] = [...(nextDepartments[name] || []), member];
      persist(root, nextDepartments, state.categoryMap);
    });
    root.appendChild(modal);
  });

  card.querySelectorAll(".dept-table__edit").forEach((btn, index) => {
    btn.addEventListener("click", () => {
      const current = members[index];
      const modal = createMemberModal(name, current, (updatedMember) => {
        const nextDepartments = rawDepartments();
        nextDepartments[name] = [...nextDepartments[name]];
        nextDepartments[name][index] = updatedMember;
        persist(root, nextDepartments, state.categoryMap);
      });
      root.appendChild(modal);
    });
  });

  card.querySelectorAll(".dept-table__delete").forEach((btn, index) => {
    btn.addEventListener("click", () => {
      const current = members[index];
      if (!confirm(`Remove ${current.displayName} from ${name}?`)) return;
      const nextDepartments = rawDepartments();
      const list = [...nextDepartments[name]];
      list.splice(index, 1);
      nextDepartments[name] = list;
      persist(root, nextDepartments, state.categoryMap);
    });
  });

  return card;
}

function createMemberModal(departmentName, initialMember, onSubmit) {
  const backdrop = el("div", { class: "dept-modal-backdrop" }, [
    el("div", { class: "dept-modal" }, [
      el("h3", { text: initialMember ? `Edit member in ${departmentName}` : `Add member to ${departmentName}` }),
      el("form", { class: "dept-form" }, [
        el("div", { class: "dept-field" }, [
          el("label", { for: "dept-member-officer", text: "Officer" }),
          el(
            "select",
            { id: "dept-member-officer", name: "officerId", required: true },
            state.officerOptions.map((o) =>
              el("option", {
                value: String(o.officerId),
                text: officerTag(o),
                selected: initialMember?.officerId === o.officerId ? "selected" : null,
              })
            )
          ),
        ]),
        el("div", { class: "dept-field" }, [
          el("label", { for: "dept-member-role", text: "Role" }),
          el(
            "select",
            { id: "dept-member-role", name: "role" },
            state.departmentRoles.map((r) =>
              el("option", { value: r, text: r, selected: (initialMember?.role || state.departmentRoles[2]) === r ? "selected" : null })
            )
          ),
        ]),
        el("div", { class: "dept-modal__actions" }, [
          el("button", { type: "button", text: "Cancel" }),
          el("button", { type: "submit", text: initialMember ? "Save Changes" : "Save Member" }),
        ]),
      ]),
    ]),
  ]);

  const form = backdrop.querySelector(".dept-form");
  backdrop.querySelector("button[type='button']").addEventListener("click", () => backdrop.remove());

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const officerId = Number(formData.get("officerId"));
    if (!officerId) return;
    onSubmit({ officerId, role: String(formData.get("role") || state.departmentRoles[2]) });
    backdrop.remove();
  });

  return backdrop;
}

function createDepartmentModal(initialName, initialCategory, onSubmit) {
  const backdrop = el("div", { class: "dept-modal-backdrop" }, [
    el("div", { class: "dept-modal" }, [
      el("h3", { text: initialName ? `Edit department ${initialName}` : "Add department" }),
      el("form", { class: "dept-form" }, [
        el("div", { class: "dept-field" }, [
          el("label", { for: "dept-name", text: "Department Name" }),
          el("input", { id: "dept-name", name: "name", type: "text", required: true, value: initialName || "" }),
        ]),
        el("div", { class: "dept-field" }, [
          el("label", { for: "dept-category", text: "Category" }),
          el("select", { id: "dept-category", name: "category" }, [
            el("option", { value: "game", text: "Game Department", selected: (initialCategory || "game") === "game" ? "selected" : null }),
            el("option", { value: "maintenance", text: "Maintenance Department", selected: initialCategory === "maintenance" ? "selected" : null }),
          ]),
        ]),
        el("div", { class: "dept-modal__actions" }, [
          el("button", { type: "button", text: "Cancel" }),
          el("button", { type: "submit", text: initialName ? "Save Changes" : "Save Department" }),
        ]),
      ]),
    ]),
  ]);

  const form = backdrop.querySelector(".dept-form");
  backdrop.querySelector("button[type='button']").addEventListener("click", () => backdrop.remove());

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const name = String(formData.get("name") || "").trim();
    if (!name) return;
    onSubmit({ name, category: String(formData.get("category") || "game") });
    backdrop.remove();
  });

  return backdrop;
}

function renderDepartments(root) {
  const gameGrid = el("div", { class: "dept-grid" });
  const maintenanceGrid = el("div", { class: "dept-grid" });

  for (const name of state.allDepartmentNames.game) {
    gameGrid.appendChild(createDepartmentCard(root, name, state.departments[name] || []));
  }
  for (const name of state.allDepartmentNames.maintenance) {
    maintenanceGrid.appendChild(createDepartmentCard(root, name, state.departments[name] || []));
  }

  const createSection = (title, category, grid) =>
    el("div", { class: "dept-section" }, [
      el("div", { class: "dept-section__header" }, [
        el("h2", { class: "dept-section__title", text: title }),
        state.canEdit
          ? el("button", {
              class: "dept-section__button",
              type: "button",
              text: `+ Add ${category === "game" ? "Game" : "Maintenance"} Department`,
              onclick: () => {
                const modal = createDepartmentModal("", category, (dept) => {
                  const nextDepartments = rawDepartments();
                  if (nextDepartments[dept.name]) return alert("A department with that name already exists.");
                  nextDepartments[dept.name] = [];
                  const nextCategoryMap = { ...state.categoryMap, [dept.name]: dept.category };
                  persist(root, nextDepartments, nextCategoryMap);
                });
                root.appendChild(modal);
              },
            })
          : null,
      ]),
      grid,
    ]);

  const content = el("div", {}, [
    el("div", { class: "page-heading" }, [
      el("div", {}, [
        el("h1", { class: "page-title", text: "Departments" }),
        el("p", {
          class: "page-subtitle",
          text: state.canEdit
            ? "Shared department rosters — changes save for the whole unit."
            : "Department rosters, maintained by Regimental Command.",
        }),
      ]),
    ]),
    createSection("Game Departments", "game", gameGrid),
    createSection("Maintenance Departments", "maintenance", maintenanceGrid),
  ]);

  root.replaceChildren(content);
}

async function init() {
  const root = document.getElementById("departments-root");
  if (!root) return;
  try {
    state = await apiFetch("/api/departments");
    renderDepartments(root);
  } catch (err) {
    root.replaceChildren(el("p", { class: "auth-message auth-message--error", text: err.message }));
  }
}

init();

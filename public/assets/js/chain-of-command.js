/* ===================================================================
   CHAIN OF COMMAND RENDERER
   Reads the roster from /api/hierarchy (Cloudflare D1, via the Worker)
   and builds the org-chart tree. Regimental Command edits the roster
   through the Admin panel — this script never needs to change for that.
   =================================================================== */

const DATA_URL = "/api/hierarchy";

const RANK_ICONS = {
  "O-1": "assets/img/ranks/o1-2ndlt.png",
  "O-2": "assets/img/ranks/o2-1stlt.png",
  "O-3": "assets/img/ranks/o3-capt.png",
  "O-4": "assets/img/ranks/o4-major.png",
  "O-5": "assets/img/ranks/o5-ltcol.png",
  "O-6": "assets/img/ranks/o6-colonel.png",
  "O-7": "assets/img/ranks/o7-briggen.png",
  "O-8": "assets/img/ranks/o8-majgen.png",
  "O-9": "assets/img/ranks/o9-ltgen.png",
  "CW-2": "assets/img/ranks/cw2-cwo2.png",
  "CW-3": "assets/img/ranks/cw3-cwo3.png",
  "CW-4": "assets/img/ranks/cw4-cwo4.png",
  "CW-5": "assets/img/ranks/cw5-cwo5.png",
};

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

function rankIcon(rank) {
  const src = RANK_ICONS[rank];
  if (src) {
    return el("img", { class: "coc-row__insignia", src, alt: rank });
  }
  return el("span", { class: "coc-row__insignia--placeholder" });
}

function positionRow(position) {
  let nameNode;
  if (position.status === "filled") {
    nameNode = el("span", { class: "coc-row__name", text: position.name });
  } else if (position.status === "closed") {
    nameNode = el("span", { class: "coc-row__name coc-closed-label", text: "Closed" });
  } else {
    nameNode = el("span", { class: "coc-row__name coc-row__name--vacant", text: "Open" });
  }

  return el("div", { class: "coc-row" }, [
    el("span", { class: "coc-row__rank" }, [
      rankIcon(position.rank),
      el("span", {}, [
        el("span", { class: "coc-row__code", text: `[${position.rank}] ` }),
        document.createTextNode(position.title),
      ]),
    ]),
    nameNode,
  ]);
}

function tierBar(label, extraClass = "") {
  return el("div", { class: `coc-tier-bar ${extraClass}`.trim(), text: label });
}

function table({ leftLabel, rightLabel, positions, variant }) {
  const header = el("div", { class: "coc-table__header" }, [
    el("span", { text: leftLabel }),
    el("span", { text: rightLabel }),
  ]);
  return el("div", { class: `coc-table coc-table--${variant}` }, [header, ...positions.map(positionRow)]);
}

function companyTable(company) {
  return el("div", { class: "coc-company-table" }, [
    table({ leftLabel: company.label, rightLabel: "Staff", positions: company.positions, variant: "company" }),
  ]);
}

function battalionBlock(battalion) {
  const battalionTable = el("div", { class: "coc-battalion-table" }, [
    table({ leftLabel: battalion.label, rightLabel: "Command", positions: battalion.positions, variant: "battalion" }),
  ]);

  const companies = battalion.companies || [];
  let companiesSection = null;
  if (companies.length > 0) {
    const companiesBranch = el(
      "div",
      { class: "coc-branch coc-branch--companies" },
      companies.map((company) =>
        el(
          "div",
          { class: "coc-branch-item" + (companies.length === 1 ? " coc-branch-item--only" : "") },
          [companyTable(company)]
        )
      )
    );
    companiesSection = el("div", { class: "coc-companies-wrap" }, [
      tierBar("Company Command"),
      companiesBranch,
    ]);
  }

  return el("div", { class: "coc-battalion-block" }, [battalionTable, companiesSection]);
}

function standaloneRoster(section) {
  let body;
  if (section.positions) {
    body = [table({ leftLabel: section.label, rightLabel: "Staff", positions: section.positions, variant: "roster" })];
  } else {
    const members = section.members || [];
    const header = el("div", { class: "coc-table__header" }, [
      el("span", { text: section.label }),
      el("span", { text: "Staff" }),
    ]);
    const rows =
      members.length > 0
        ? el(
            "ul",
            { class: "coc-roster-list" },
            members.map((name) => el("li", { text: name }))
          )
        : el("p", { class: "coc-roster-empty", text: "No one currently on ELOA." });
    body = [el("div", { class: "coc-table coc-table--roster" }, [header, rows])];
  }

  return el("div", { class: "coc-standalone" }, body);
}

function renderChainOfCommand(data, root) {
  const regimentTable = el("div", { class: "coc-regiment" }, [
    table({
      leftLabel: data.regiment.label,
      rightLabel: "Command",
      positions: data.regiment.positions,
      variant: "regiment",
    }),
  ]);

  const battalionsBranch = el(
    "div",
    { class: "coc-branch coc-branch--battalions" },
    data.battalions.map((battalion) =>
      el(
        "div",
        { class: "coc-branch-item" + (data.battalions.length === 1 ? " coc-branch-item--only" : "") },
        [battalionBlock(battalion)]
      )
    )
  );

  const standaloneSection = el("div", { class: "coc-standalone-section" }, [
    el("p", {
      class: "coc-standalone-caption",
      text: "Additional rosters — not part of the chain of command",
    }),
    el("div", { class: "coc-standalone-row" }, [
      standaloneRoster(data.warrantOfficers),
      standaloneRoster(data.reserves),
    ]),
  ]);

  root.appendChild(
    el("div", { class: "coc-tree" }, [
      tierBar("Regimental Command", "coc-tier-bar--top"),
      regimentTable,
      tierBar("Battalion Command", "coc-tier-bar--full"),
      battalionsBranch,
      standaloneSection,
    ])
  );
}

async function init() {
  const root = document.getElementById("coc-root");
  try {
    const response = await fetch(DATA_URL);
    if (!response.ok) throw new Error(`Failed to load ${DATA_URL}: ${response.status}`);
    const data = await response.json();
    renderChainOfCommand(data, root);
  } catch (err) {
    root.appendChild(
      el("p", {
        class: "coc-roster-empty",
        text: "Could not load the chain of command data. Check data/chain-of-command.json.",
      })
    );
    console.error(err);
  }
}

init();

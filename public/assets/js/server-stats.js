/* Server Stats page: join/leave analytics from the Discord bot's Google Sheet,
   served pre-aggregated by GET /api/server-stats. */
(async function initServerStats() {
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const NS = "http://www.w3.org/2000/svg";
  const COLOR_JOIN = "#3aa655";
  const COLOR_LEAVE = "#e5484d";
  const COLOR_INTAKE = "#ebae46";
  const COLOR_GRID = "#333a3f";
  const COLOR_MUTED = "#a9b2ae";
  const root = document.getElementById("stats-root");

  let stats;
  try {
    stats = await apiFetch("/api/server-stats");
  } catch (err) {
    root.textContent = "";
    root.appendChild(message(`Could not load server stats: ${err.message}`));
    return;
  }

  root.textContent = "";

  if (!stats.configured) {
    root.appendChild(
      message(
        "Server stats are not connected yet. Publish the join/leave Google Sheet as CSV " +
          "(File → Share → Publish to web) and add its link as the SHEET_CSV_URL secret."
      )
    );
    return;
  }

  if (!stats.totalEvents) {
    root.appendChild(message("The stats sheet is connected but has no join/leave entries yet."));
    return;
  }

  const tooltip = document.createElement("div");
  tooltip.className = "stats-tooltip";
  document.body.appendChild(tooltip);

  root.appendChild(metaLine(stats));
  root.appendChild(cards(stats));
  root.appendChild(
    chartPanel("Joins, Leaves & Intake — Last 30 Days", dailyLegend(), barChart(stats.daily, {
      width: 960,
      height: 320,
      label: (d) => fmtDate(d.date),
      xLabelEvery: 5,
      intakeLine: true,
      trendLines: true,
    }))
  );
  root.appendChild(
    chartPanel("Joins vs Leaves — Weekly, Last 12 Weeks", pairLegend(), barChart(stats.weekly, {
      width: 720,
      height: 260,
      label: (d) => `Week of ${fmtDate(d.weekStart)}`,
      shortLabel: (d) => fmtDate(d.weekStart),
      xLabelEvery: 2,
    }))
  );
  root.appendChild(chartPanel("Member Growth — Net Since Tracking Began", null, growthChart(stats.growth)));
  if ((stats.forecastVsActual || []).length) {
    root.appendChild(
      chartPanel("Monthly Forecast vs Actual — Net Growth", forecastLegend(stats.forecastVsActual), forecastChart(stats.forecastVsActual))
    );
  }
  root.appendChild(monthlyPanel(stats.monthly, stats.forecastVsActual));
  root.appendChild(recentPanel(stats.recent));

  /* ---------- text pieces ---------- */

  function message(text) {
    const div = document.createElement("div");
    div.className = "stats-message";
    div.textContent = text;
    return div;
  }

  function metaLine(s) {
    const wrap = document.createElement("div");

    // Authoritative current-member count (from the hourly anchor) — the drift-proof
    // headline number, shown above the event-derived tracking summary.
    if (s.authoritative) {
      const headline = document.createElement("div");
      headline.className = "stats-current-members";
      const strong = document.createElement("strong");
      strong.textContent = Number(s.authoritative.humanCount).toLocaleString();
      headline.appendChild(strong);
      const rest = document.createElement("span");
      rest.textContent = ` current members · as of ${fmtDateFull(s.authoritative.takenAt.slice(0, 10))}`;
      headline.appendChild(rest);
      wrap.appendChild(headline);
    }

    const div = document.createElement("div");
    div.className = "stats-meta";
    let text =
      `Tracking since ${fmtDateFull(s.firstDate)} · ${s.totalEvents} events · ` +
      `${s.retention.uniqueJoiners} unique users · last entry ${fmtDateFull(s.lastDate)}`;
    if (s.anchorDrift && Math.abs(s.anchorDrift.value) >= 1) {
      text += ` · reconciliation: ${s.anchorDrift.value > 0 ? "+" : ""}${s.anchorDrift.value} vs authoritative count`;
    }
    div.textContent = text;
    wrap.appendChild(div);
    return wrap;
  }

  function cards(s) {
    const wrap = document.createElement("div");
    wrap.className = "stats-cards";
    wrap.appendChild(card("Last 7 Days", [
      ["Joins", s.last7.joins, "join"],
      ["Leaves", s.last7.leaves, "leave"],
      ["Net", fmtNet(s.last7.net), "net"],
    ]));
    wrap.appendChild(card("Last 30 Days", [
      ["Joins", s.last30.joins, "join"],
      ["Leaves", s.last30.leaves, "leave"],
      ["Net", fmtNet(s.last30.net), "net"],
    ]));
    wrap.appendChild(card("All Time", [
      ["Joins", s.totals.joins, "join"],
      ["Leaves", s.totals.leaves, "leave"],
      ["Net", fmtNet(s.totals.net), "net"],
    ]));
    const r = s.retention;
    wrap.appendChild(card("Retention", [
      ["Median stay", r.medianStayDays === null ? "—" : `${r.medianStayDays} days`, "plain"],
      ["Left within 7 days", r.quickQuitPct === null ? "—" : `${r.quickQuitPct}%`, "leave"],
      ["Rejoined users", r.rejoiners, "plain"],
    ]));
    return wrap;
  }

  function card(title, rows) {
    const div = document.createElement("div");
    div.className = "stats-card";
    const h = document.createElement("div");
    h.className = "stats-card__title";
    h.textContent = title;
    div.appendChild(h);
    for (const [label, value, kind] of rows) {
      const row = document.createElement("div");
      row.className = "stats-card__row";
      const l = document.createElement("span");
      l.className = "stats-card__label";
      l.textContent = label;
      const v = document.createElement("span");
      v.className = `stats-card__value stats-card__value--${kind}`;
      v.textContent = value;
      row.appendChild(l);
      row.appendChild(v);
      div.appendChild(row);
    }
    return div;
  }

  /* ---------- chart scaffolding ---------- */

  function chartPanel(title, legend, chartEl) {
    const panel = document.createElement("div");
    panel.className = "stats-panel";
    const h = document.createElement("div");
    h.className = "stats-panel__title";
    h.textContent = title;
    panel.appendChild(h);
    if (legend) panel.appendChild(legend);
    const scroll = document.createElement("div");
    scroll.className = "stats-chart-scroll";
    scroll.appendChild(chartEl);
    panel.appendChild(scroll);
    return panel;
  }

  function pairLegend() {
    const legend = document.createElement("div");
    legend.className = "stats-legend";
    legend.appendChild(legendItem(COLOR_JOIN, "Joins", "solid"));
    legend.appendChild(legendItem(COLOR_LEAVE, "Leaves", "striped"));
    return legend;
  }

  function dailyLegend() {
    const legend = pairLegend();
    legend.appendChild(legendItem(COLOR_INTAKE, "Intake (net)", "line"));
    return legend;
  }

  function forecastLegend(data) {
    const legend = document.createElement("div");
    legend.className = "stats-legend";
    legend.appendChild(legendItem(COLOR_JOIN, "Actual", "solid"));
    if (data.some((d) => d.forecastSource === "recorded")) {
      legend.appendChild(legendItem(COLOR_INTAKE, "Forecast (recorded)", "solid"));
    }
    if (data.some((d) => d.forecastSource === "modeled")) {
      legend.appendChild(legendItem(COLOR_INTAKE, "Forecast (modeled)", "striped"));
    }
    return legend;
  }

  // Forecast vs actual: up to two bars per month — actual (solid green) and forecast
  // (gold; solid if recorded ahead of time, hatched if modeled/backtested). Each bar
  // is labelled with its net value; the tooltip adds the variance.
  function forecastChart(data) {
    const H = 270;
    const M = { top: 14, right: 8, bottom: 28, left: 40 };
    const groupW = 96;
    const W = Math.max(720, M.left + M.right + data.length * groupW);
    const barW = 26;
    const gap = 3;

    const vals = [];
    for (const d of data) {
      if (d.actual !== null) vals.push(d.actual);
      if (d.forecast !== null) vals.push(d.forecast);
    }
    const svg = makeSvg(W, H);
    const y = gridAndScale(svg, W, H, M, Math.min(0, ...vals), Math.max(1, ...vals));
    const y0 = y(0);

    const drawBar = (cx, value, fill, opacity) => {
      const top = Math.min(y(value), y0);
      const height = Math.abs(y(value) - y0);
      const bar = rect(cx - barW / 2, top, barW, height, fill);
      if (opacity) bar.setAttribute("opacity", opacity);
      svg.appendChild(bar);
      const cy = value >= 0 ? top - 11 : top + height + 11;
      svg.appendChild(valuePill(cx, cy, fmtNet(value)));
    };

    data.forEach((d, i) => {
      const cx = M.left + i * groupW + groupW / 2;
      const hasBoth = d.actual !== null && d.forecast !== null;
      const actualX = hasBoth ? cx - (barW + gap) / 2 : cx;
      const forecastX = hasBoth ? cx + (barW + gap) / 2 : cx;

      if (d.actual !== null) drawBar(actualX, d.actual, COLOR_JOIN);
      if (d.forecast !== null) {
        drawBar(forecastX, d.forecast, d.forecastSource === "recorded" ? COLOR_INTAKE : "url(#forecast-stripes)", "0.9");
      }

      const label = document.createElementNS(NS, "text");
      label.setAttribute("x", cx);
      label.setAttribute("y", H - 8);
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("fill", COLOR_MUTED);
      label.setAttribute("font-size", "10");
      label.textContent = fmtMonth(d.month);
      svg.appendChild(label);

      const hover = rect(M.left + i * groupW, M.top, groupW, H - M.top - M.bottom, "transparent");
      hover.addEventListener("mousemove", (e) => {
        const lines = [];
        if (d.actual !== null) lines.push(`Actual: ${fmtNet(d.actual)}${d.actualPartial ? " (so far)" : ""}`);
        if (d.forecast !== null) lines.push(`Forecast: ${fmtNet(d.forecast)} (${d.forecastSource})`);
        if (d.actual !== null && d.forecast !== null && !d.actualPartial) {
          lines.push(`Variance: ${fmtNet(d.actual - d.forecast)}`);
        }
        showTip(e, `<strong>${fmtMonthFull(d.month)}</strong><br>${lines.join("<br>")}`);
      });
      hover.addEventListener("mouseleave", hideTip);
      svg.appendChild(hover);
    });

    return svg;
  }

  // Small dark rounded badge with white text, centred on (cx, cy).
  function valuePill(cx, cy, text) {
    const g = document.createElementNS(NS, "g");
    const w = text.length * 6.5 + 10;
    const h = 15;
    const pill = document.createElementNS(NS, "rect");
    pill.setAttribute("x", cx - w / 2);
    pill.setAttribute("y", cy - h / 2);
    pill.setAttribute("width", w);
    pill.setAttribute("height", h);
    pill.setAttribute("rx", "4");
    pill.setAttribute("fill", "#161920");
    pill.setAttribute("opacity", "0.85");
    g.appendChild(pill);
    const label = document.createElementNS(NS, "text");
    label.setAttribute("x", cx);
    label.setAttribute("y", cy + 3.5);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("font-size", "11");
    label.setAttribute("font-weight", "700");
    label.setAttribute("fill", "#ffffff");
    label.textContent = text;
    g.appendChild(label);
    return g;
  }

  function legendItem(color, label, style) {
    const item = document.createElement("span");
    item.className = "stats-legend__item";
    const swatch = document.createElement("span");
    swatch.className = style === "line" ? "stats-legend__swatch stats-legend__swatch--line" : "stats-legend__swatch";
    swatch.style.background =
      style === "striped" ? `repeating-linear-gradient(45deg, ${color} 0 4px, #16191f66 4px 6px)` : color;
    item.appendChild(swatch);
    item.appendChild(document.createTextNode(label));
    return item;
  }

  function makeSvg(W, H) {
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("role", "img");
    const defs = document.createElementNS(NS, "defs");
    defs.innerHTML =
      '<pattern id="leave-stripes" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">' +
      `<rect width="6" height="6" fill="${COLOR_LEAVE}"></rect>` +
      '<line x1="0" y1="0" x2="0" y2="6" stroke="#16191f" stroke-width="2" opacity="0.35"></line>' +
      "</pattern>" +
      '<pattern id="forecast-stripes" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">' +
      `<rect width="6" height="6" fill="${COLOR_INTAKE}"></rect>` +
      '<line x1="0" y1="0" x2="0" y2="6" stroke="#16191f" stroke-width="2" opacity="0.4"></line>' +
      "</pattern>";
    svg.appendChild(defs);
    return svg;
  }

  function gridAndScale(svg, W, H, M, minVal, maxVal) {
    const plotH = H - M.top - M.bottom;
    const step = niceStep((maxVal - minVal) / 4);
    const top = step * Math.ceil(maxVal / step);
    const bottom = step * Math.floor(minVal / step);
    const y = (v) => M.top + ((top - v) / (top - bottom)) * plotH;
    for (let v = bottom; v <= top; v += step) {
      const gy = y(v);
      const line = document.createElementNS(NS, "line");
      line.setAttribute("x1", M.left);
      line.setAttribute("x2", W - M.right);
      line.setAttribute("y1", gy);
      line.setAttribute("y2", gy);
      line.setAttribute("stroke", COLOR_GRID);
      line.setAttribute("stroke-width", v === 0 ? "2" : "1");
      svg.appendChild(line);
      const label = document.createElementNS(NS, "text");
      label.setAttribute("x", M.left - 8);
      label.setAttribute("y", gy + 3);
      label.setAttribute("text-anchor", "end");
      label.setAttribute("fill", COLOR_MUTED);
      label.setAttribute("font-size", "10");
      label.textContent = v;
      svg.appendChild(label);
    }
    return y;
  }

  function niceStep(rough) {
    if (rough <= 1) return 1;
    if (rough <= 2) return 2;
    if (rough <= 5) return 5;
    return Math.ceil(rough / 10) * 10;
  }

  function showTip(e, html) {
    tooltip.innerHTML = html;
    tooltip.style.display = "block";
    tooltip.style.left = `${Math.min(e.clientX + 12, window.innerWidth - 200)}px`;
    tooltip.style.top = `${e.clientY + 14}px`;
  }

  function hideTip() {
    tooltip.style.display = "none";
  }

  /* ---------- bar chart (daily & weekly), optional intake line + trends ---------- */

  function barChart(data, opts) {
    const W = opts.width;
    const H = opts.height;
    const M = { top: 12, right: 8, bottom: 28, left: 36 };
    const plotW = W - M.left - M.right;
    const groupW = plotW / data.length;
    const barW = Math.min(18, Math.max(4, Math.floor(groupW / 2) - 2));

    const maxBar = Math.max(1, ...data.map((d) => Math.max(d.joins, d.leaves)));
    const minVal = opts.intakeLine ? Math.min(0, ...data.map((d) => d.net)) : 0;
    const svg = makeSvg(W, H);
    const y = gridAndScale(svg, W, H, M, minVal, maxBar);
    const y0 = y(0);
    const cx = (i) => M.left + i * groupW + groupW / 2;

    data.forEach((d, i) => {
      svg.appendChild(rect(cx(i) - barW - 1, y(d.joins), barW, y0 - y(d.joins), COLOR_JOIN));
      svg.appendChild(rect(cx(i) + 1, y(d.leaves), barW, y0 - y(d.leaves), "url(#leave-stripes)"));

      if (i % opts.xLabelEvery === 0) {
        const label = document.createElementNS(NS, "text");
        label.setAttribute("x", cx(i));
        label.setAttribute("y", H - 8);
        label.setAttribute("text-anchor", "middle");
        label.setAttribute("fill", COLOR_MUTED);
        label.setAttribute("font-size", "10");
        label.textContent = (opts.shortLabel || opts.label)(d);
        svg.appendChild(label);
      }
    });

    if (opts.trendLines) {
      svg.appendChild(trendLine(data.map((d) => d.joins), cx, y, COLOR_JOIN));
      svg.appendChild(trendLine(data.map((d) => d.leaves), cx, y, COLOR_LEAVE));
    }

    if (opts.intakeLine) {
      const pts = data.map((d, i) => [cx(i), y(d.net)]);
      const path = document.createElementNS(NS, "path");
      path.setAttribute("d", smoothPath(pts));
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", COLOR_INTAKE);
      path.setAttribute("stroke-width", "2.5");
      path.setAttribute("stroke-linecap", "round");
      svg.appendChild(path);
    }

    // invisible hover targets, one per group
    data.forEach((d, i) => {
      const hover = rect(M.left + i * groupW, M.top, groupW, H - M.top - M.bottom, "transparent");
      hover.addEventListener("mousemove", (e) =>
        showTip(e, `<strong>${opts.label(d)}</strong><br>Joins: ${d.joins} · Leaves: ${d.leaves} · Net: ${fmtNet(d.net)}`)
      );
      hover.addEventListener("mouseleave", hideTip);
      svg.appendChild(hover);
    });

    return svg;
  }

  function rect(x, top, w, h, fill) {
    const r = document.createElementNS(NS, "rect");
    r.setAttribute("x", x);
    r.setAttribute("y", top);
    r.setAttribute("width", w);
    r.setAttribute("height", Math.max(h, 0));
    if (fill !== "transparent") r.setAttribute("rx", "2");
    r.setAttribute("fill", fill);
    return r;
  }

  // Least-squares straight line over the series, drawn thin and dashed.
  function trendLine(values, cx, y, color) {
    const n = values.length;
    const meanX = (n - 1) / 2;
    const meanY = values.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      num += (i - meanX) * (values[i] - meanY);
      den += (i - meanX) * (i - meanX);
    }
    const slope = den ? num / den : 0;
    const line = document.createElementNS(NS, "line");
    line.setAttribute("x1", cx(0));
    line.setAttribute("y1", y(meanY - slope * meanX));
    line.setAttribute("x2", cx(n - 1));
    line.setAttribute("y2", y(meanY + slope * (n - 1 - meanX)));
    line.setAttribute("stroke", color);
    line.setAttribute("stroke-width", "1.5");
    line.setAttribute("stroke-dasharray", "5 4");
    line.setAttribute("opacity", "0.45");
    return line;
  }

  // Catmull-Rom → cubic bezier, for the smooth intake curve.
  function smoothPath(pts) {
    if (pts.length < 3) return `M ${pts.map((p) => p.join(" ")).join(" L ")}`;
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${p2[0]} ${p2[1]}`;
    }
    return d;
  }

  /* ---------- growth line chart ---------- */

  function growthChart(growth) {
    const W = 960;
    const H = 260;
    const M = { top: 12, right: 8, bottom: 28, left: 40 };
    const plotW = W - M.left - M.right;

    const values = growth.map((g) => g.total);
    const svg = makeSvg(W, H);
    const y = gridAndScale(svg, W, H, M, Math.min(0, ...values), Math.max(1, ...values));
    const x = (i) => M.left + (growth.length === 1 ? plotW / 2 : (i / (growth.length - 1)) * plotW);

    // area fill under the line
    const linePts = growth.map((g, i) => `${x(i)} ${y(g.total)}`);
    const area = document.createElementNS(NS, "path");
    area.setAttribute("d", `M ${x(0)} ${y(0)} L ${linePts.join(" L ")} L ${x(growth.length - 1)} ${y(0)} Z`);
    area.setAttribute("fill", COLOR_INTAKE);
    area.setAttribute("opacity", "0.12");
    svg.appendChild(area);

    const path = document.createElementNS(NS, "path");
    path.setAttribute("d", `M ${linePts.join(" L ")}`);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", COLOR_INTAKE);
    path.setAttribute("stroke-width", "2");
    svg.appendChild(path);

    // month labels at each 1st of the month
    growth.forEach((g, i) => {
      if (!g.date.endsWith("-01")) return;
      const label = document.createElementNS(NS, "text");
      label.setAttribute("x", x(i));
      label.setAttribute("y", H - 8);
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("fill", COLOR_MUTED);
      label.setAttribute("font-size", "10");
      label.textContent = fmtDate(g.date);
      svg.appendChild(label);
    });

    // hover: nearest point
    const marker = document.createElementNS(NS, "circle");
    marker.setAttribute("r", "4");
    marker.setAttribute("fill", COLOR_INTAKE);
    marker.setAttribute("display", "none");
    svg.appendChild(marker);

    const overlay = rect(M.left, M.top, plotW, H - M.top - M.bottom, "transparent");
    overlay.addEventListener("mousemove", (e) => {
      const box = svg.getBoundingClientRect();
      const px = ((e.clientX - box.left) / box.width) * W;
      const i = Math.max(0, Math.min(growth.length - 1, Math.round(((px - M.left) / plotW) * (growth.length - 1))));
      marker.setAttribute("cx", x(i));
      marker.setAttribute("cy", y(growth[i].total));
      marker.removeAttribute("display");
      showTip(e, `<strong>${fmtDateFull(growth[i].date)}</strong><br>Net members gained: ${fmtNet(growth[i].total)}`);
    });
    overlay.addEventListener("mouseleave", () => {
      marker.setAttribute("display", "none");
      hideTip();
    });
    svg.appendChild(overlay);

    return svg;
  }

  /* ---------- tables ---------- */

  function monthlyPanel(monthly, forecastVsActual) {
    const fc = new Map((forecastVsActual || []).map((d) => [d.month, d]));
    const rows = monthly.map((m) => {
      const [yr, mo] = m.month.split("-").map(Number);
      const f = fc.get(m.month);
      const forecast = f && f.forecast !== null ? fmtNet(f.forecast) : "—";
      const variance = f && f.forecast !== null && !f.actualPartial ? fmtNet(m.net - f.forecast) : "—";
      return [`${MONTHS[mo - 1]} ${yr}`, m.joins, m.leaves, fmtNet(m.net), forecast, variance];
    });
    return tablePanel("Monthly Summary", ["Month", "Joins", "Leaves", "Actual", "Forecast", "Δ"], rows);
  }

  function recentPanel(recent) {
    const panel = tablePanel(
      "Recent Activity",
      ["Date", "User", "Action"],
      recent.map((e) => [fmtDateFull(e.date), e.user, e])
    );
    // swap the plain action cell for a colored badge
    panel.querySelectorAll("tbody tr").forEach((tr, i) => {
      const td = tr.lastChild;
      td.textContent = "";
      const badge = document.createElement("span");
      badge.className = `stats-badge stats-badge--${recent[i].action}`;
      badge.textContent = recent[i].action;
      td.appendChild(badge);
    });
    return panel;
  }

  function tablePanel(title, headers, rows) {
    const panel = document.createElement("div");
    panel.className = "stats-panel";
    const h = document.createElement("div");
    h.className = "stats-panel__title";
    h.textContent = title;
    panel.appendChild(h);

    const scroll = document.createElement("div");
    scroll.className = "stats-table-scroll";
    const table = document.createElement("table");
    table.className = "stats-table";

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (const label of headers) {
      const th = document.createElement("th");
      th.textContent = label;
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (const cells of rows) {
      const tr = document.createElement("tr");
      for (const cell of cells) {
        const td = document.createElement("td");
        td.textContent = typeof cell === "object" ? "" : cell;
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    scroll.appendChild(table);
    panel.appendChild(scroll);
    return panel;
  }

  /* ---------- formatting ---------- */

  function fmtMonth(key) {
    const [, m] = key.split("-").map(Number);
    return MONTHS[m - 1];
  }

  function fmtMonthFull(key) {
    const [y, m] = key.split("-").map(Number);
    return `${MONTHS[m - 1]} ${y}`;
  }

  function fmtDate(iso) {
    const [, m, d] = iso.split("-").map(Number);
    return `${d} ${MONTHS[m - 1]}`;
  }

  function fmtDateFull(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return `${d} ${MONTHS[m - 1]} ${y}`;
  }

  function fmtNet(net) {
    return net > 0 ? `+${net}` : `${net}`;
  }
})();

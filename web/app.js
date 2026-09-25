const CATEGORY_KEY = {
  raid: "raidAttacker",
  gymDefense: "gymDefender",
  stardust: "stardust",
};

const CATEGORY_LABEL = {
  raidAttacker: "Raid Attacker",
  gymDefender: "Gym Defense",
  pvp: "PvP",
  stardust: "Stardust Bonus",
};

const VERDICT_TIER = {
  "Must Catch": 1,
  "Worth Catching": 2,
  Situational: 3,
  "Skip / Dex Only": 5,
};

let scoreboard = null;
let sightings = [];
let view = "dashboard"; // "dashboard" | "detail"
let activeTab = "notable"; // which category a "detail" view is showing
let newsView = "upcoming";
let raidTierSortDir = "asc";
let pvpLeagueFilter = "all";
let searchQuery = "";

function filterBySearch(list) {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return list;
  return list.filter((s) => (s.speciesName || "").toLowerCase().startsWith(q));
}

function searchBoxHtml() {
  return `
    <div class="search-bar">
      <input type="text" id="species-search" class="search-input" placeholder="Search by name..." value="${escapeHtml(searchQuery)}" autocomplete="off" />
    </div>
  `;
}

const RAID_TIER_ORDER = ["1-Star Raids", "3-Star Raids", "5-Star Raids", "Mega Raids", "Shadow Raids"];

function raidTierRank(label) {
  const idx = RAID_TIER_ORDER.indexOf(label);
  return idx === -1 ? RAID_TIER_ORDER.length : idx;
}

function sourceLabel(s) {
  return `${escapeHtml(s.type)}: ${escapeHtml(s.detail)}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// LeekDuck event links are third-party data pulled in at sync time -- only
// allow http(s) through (never javascript:/data:) and HTML-escape the result
// before it lands in an href attribute.
function safeHref(url) {
  try {
    const u = new URL(url, location.href);
    if (u.protocol === "http:" || u.protocol === "https:") return escapeHtml(u.href);
  } catch {
    // fall through to the safe default below
  }
  return "#";
}

// Referenced by name from the inline onerror handler in spriteSlot() below.
const POKEBALL_PLACEHOLDER_SVG = `<svg class="sprite-placeholder" viewBox="0 0 64 64" aria-hidden="true">
  <circle cx="32" cy="32" r="29" fill="none" stroke="#9aa1ac" stroke-width="4"/>
  <path d="M3 32h58" stroke="#9aa1ac" stroke-width="4"/>
  <circle cx="32" cy="32" r="8" fill="#9aa1ac"/>
</svg>`;

function spriteUrl(dex, shiny) {
  if (!dex) return null;
  // The official-artwork set is much higher resolution than the plain in-game
  // sprites, so it stays crisp at the larger sizes cards/panels display it at.
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${shiny ? "shiny/" : ""}${dex}.png`;
}

function spriteSlot(dex, shiny) {
  const url = spriteUrl(dex, shiny);
  if (!url) return `<div class="sprite-slot">${POKEBALL_PLACEHOLDER_SVG}</div>`;
  return `<div class="sprite-slot"><img src="${url}" alt="" loading="lazy" onerror="this.parentElement.innerHTML=POKEBALL_PLACEHOLDER_SVG" /></div>`;
}

function typeChips(types) {
  return (types || [])
    .filter((t) => t && t !== "none")
    .map((t) => `<span class="type-chip" style="background:var(--type-${t}, var(--muted))">${t}</span>`)
    .join("");
}

function movesetRow(moveset) {
  if (!moveset || moveset.length === 0) return "";
  const labels = moveset.length > 1 ? ["Best", "Alt"] : ["Best"];
  return `<div class="moveset-row">${moveset
    .map(
      (m, i) =>
        `<span class="moveset-pill"><span class="type-chip" style="background:var(--type-${m.type}, var(--muted))">${m.type}</span>${labels[i]}: ${escapeHtml(m.fastMove)} + ${escapeHtml(m.chargedMove)}</span>`,
    )
    .join("")}</div>`;
}

function categoryBreakdown(species) {
  return ["pvp", "raidAttacker", "gymDefender", "stardust"]
    .filter((k) => species[k])
    .map((k) =>
      species[k].tier <= 2
        ? `<div>${CATEGORY_LABEL[k]} (tier ${species[k].tier}): ${species[k].reason}</div>`
        : `<div>${CATEGORY_LABEL[k]}: Tier ${species[k].tier}</div>`,
    )
    .join("");
}

function ivPill(ivs) {
  if (!ivs) return "";
  return `<div class="moveset-row"><span class="moveset-pill">IV ${ivs.atk}/${ivs.def}/${ivs.sta} &middot; Lv ${ivs.level}</span></div>`;
}

// PvPoke's recommended loadout is one fast move + up to 2 charged moves used
// together, not an either/or choice -- shown as 2 pills (fast + each charged
// move) so both options are visible at a glance.
function pvpMovesetPills(moveset) {
  if (!moveset || !moveset.fastMove) return "";
  const charged = moveset.chargedMoves || [];
  if (charged.length === 0) {
    return `<div class="moveset-row"><span class="moveset-pill">Fast: ${escapeHtml(moveset.fastMove)}</span></div>`;
  }
  const labels = charged.length > 1 ? ["Move 1", "Move 2"] : ["Move"];
  return `<div class="moveset-row">${charged
    .map((c, i) => `<span class="moveset-pill">${labels[i]}: ${escapeHtml(moveset.fastMove)} + ${escapeHtml(c)}</span>`)
    .join("")}</div>`;
}

// PvP cards are ranked within one specific league (species.pvpByLeague[league]),
// not the "best overall league" value in species.pvp -- a Pokemon can be shown
// here for Great League even if its single best league is actually Ultra.
function renderPvpLeagueCard(species, index, league) {
  const cat = species.pvpByLeague[league];
  return `
    <div class="card">
      <div class="rank">#${index + 1}</div>
      ${spriteSlot(species.dex, species.canBeShiny)}
      <div>
        <div class="name">
          ${escapeHtml(species.speciesName)}
          ${typeChips(species.types)}
          ${species.canBeShiny ? '<span class="shiny-badge">shiny</span>' : ""}
        </div>
        ${ivPill(species.pvpIVs?.[league])}
        ${pvpMovesetPills(species.pvpMoveset?.[league])}
        <div class="sources">${species.sources.map(sourceLabel).join(" · ")}</div>
        ${cat ? `<div class="reason">${cat.reason}</div>` : ""}
      </div>
      <div>${cat ? `<span class="tier-badge tier-${cat.tier}">Tier ${cat.tier}</span>` : ""}</div>
    </div>
  `;
}

// Cards for the plain per-category tabs (raid/gymDefense/pvp/stardust/notable).
function renderCard(species, index, categoryKey) {
  const cat = categoryKey ? species[categoryKey] : null;

  const badges =
    categoryKey === null
      ? ["pvp", "raidAttacker", "gymDefender", "stardust"]
          .filter((k) => species[k] && species[k].tier <= 2)
          .map((k) => `<span class="tier-badge tier-${species[k].tier}">${CATEGORY_LABEL[k]}</span>`)
          .join(" ")
      : cat
        ? `<span class="tier-badge tier-${cat.tier}">Tier ${cat.tier}</span>`
        : "";

  const reason = categoryKey
    ? cat?.reason ?? ""
    : ["pvp", "raidAttacker", "gymDefender", "stardust"]
        .filter((k) => species[k] && species[k].tier <= 2)
        .map((k) => `${CATEGORY_LABEL[k]}: ${species[k].reason}`)
        .join(" · ");

  return `
    <div class="card">
      <div class="rank">#${index + 1}</div>
      ${spriteSlot(species.dex, species.canBeShiny)}
      <div>
        <div class="name">
          ${escapeHtml(species.speciesName)}
          ${typeChips(species.types)}
          ${species.canBeShiny ? '<span class="shiny-badge">shiny</span>' : ""}
        </div>
        ${movesetRow(species.moveset)}
        <div class="sources">${species.sources.map(sourceLabel).join(" · ")}</div>
        ${reason ? `<div class="reason">${reason}</div>` : ""}
      </div>
      <div>${badges}</div>
    </div>
  `;
}

// Cards for "should I spend balls/a raid pass on this right now" tabs: lead with
// a verdict badge, then show the full per-category breakdown underneath.
function renderVerdictCard(species, index) {
  const tier = species.bestCategory ? species.bestCategory.tier : VERDICT_TIER[species.verdict];
  return `
    <div class="card">
      <div class="rank">#${index + 1}</div>
      ${spriteSlot(species.dex, species.canBeShiny)}
      <div>
        <div class="name">
          ${escapeHtml(species.speciesName)}
          ${typeChips(species.types)}
          ${species.canBeShiny ? '<span class="shiny-badge">shiny</span>' : ""}
        </div>
        ${movesetRow(species.moveset)}
        <div class="sources">${species.sources.map(sourceLabel).join(" · ")}</div>
        <div class="reason">${categoryBreakdown(species)}</div>
      </div>
      <div><span class="tier-badge tier-${tier}">${species.verdict}</span></div>
    </div>
  `;
}

function eventTypeLabel(t) {
  return String(t)
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatEventWindow(startIso, endIso) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const dateOpts = { month: "short", day: "numeric" };
  const timeOpts = { hour: "numeric", minute: "2-digit" };
  if (start.toDateString() === end.toDateString()) {
    return `${start.toLocaleDateString(undefined, dateOpts)}, ${start.toLocaleTimeString(undefined, timeOpts)}–${end.toLocaleTimeString(undefined, timeOpts)}`;
  }
  return `${start.toLocaleDateString(undefined, dateOpts)} – ${end.toLocaleDateString(undefined, dateOpts)}`;
}

function renderNewsItem(item) {
  const badge =
    item.status === "live"
      ? '<span class="tier-badge tier-1">LIVE NOW</span>'
      : item.status === "upcoming"
        ? `<span class="tier-badge tier-3">Starts ${new Date(item.start).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>`
        : `<span class="tier-badge tier-5">Ended ${new Date(item.end).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>`;

  return `
    <a class="card news-card" href="${safeHref(item.link)}" target="_blank" rel="noopener noreferrer">
      <div class="rank">·</div>
      <div>
        <div class="name">
          ${escapeHtml(item.name)}
          <span class="type-chip news-type-chip">${escapeHtml(eventTypeLabel(item.eventType))}</span>
        </div>
        <div class="sources">${formatEventWindow(item.start, item.end)}</div>
      </div>
      <div>${badge}</div>
    </a>
  `;
}

function newsViewControlHtml() {
  return `
    <div class="tier-sort-control">
      <label for="news-view-select">Show</label>
      <select id="news-view-select">
        <option value="upcoming" ${newsView === "upcoming" ? "selected" : ""}>Live &amp; Upcoming</option>
        <option value="recent" ${newsView === "recent" ? "selected" : ""}>Recently Ended</option>
      </select>
    </div>
  `;
}

function renderNewsTab(newsSubView) {
  const news = scoreboard.news;

  if (newsSubView === "recent") {
    const html = news.recent.length
      ? news.recent.map(renderNewsItem).join("")
      : '<div class="empty">Nothing wrapped up in the last two weeks.</div>';
    return `
      <p class="tab-note">Events that wrapped up in the last two weeks -- from LeekDuck's event calendar. Click any item to open its LeekDuck page.</p>
      ${newsViewControlHtml()}
      <h2 class="group-heading">Recently Ended</h2>
      ${html}
    `;
  }

  const html = news.upcoming.length
    ? news.upcoming.map(renderNewsItem).join("")
    : '<div class="empty">Nothing live or starting soon right now.</div>';
  return `
    <p class="tab-note">Live and upcoming events -- from LeekDuck's event calendar. Click any item to open its LeekDuck page.</p>
    ${newsViewControlHtml()}
    <h2 class="group-heading">Live &amp; Upcoming</h2>
    ${html}
  `;
}

function renderList(list, categoryKey) {
  if (!list || list.length === 0) {
    return `<div class="empty">${POKEBALL_PLACEHOLDER_SVG.replace('class="sprite-placeholder"', 'class="pokeball-spin"')}<span>Nothing here right now — check back after the next event or raid rotation.</span></div>`;
  }
  const useVerdict = categoryKey === "verdict";
  return list.map((s, i) => (useVerdict ? renderVerdictCard(s, i) : renderCard(s, i, categoryKey))).join("");
}

function renderSightingItem(s) {
  const when = new Date(s.loggedAt).toLocaleString();
  const worth = s.worth;

  let worthBlock = "";
  let badge = "";
  let dex = null;
  let types = [];
  let moveset = [];
  if (worth === null) {
    worthBlock = '<div class="reason">Worth calculation isn\'t available yet — check back soon.</div>';
  } else if (!worth.resolved) {
    worthBlock = `<div class="reason">Couldn't match "${escapeHtml(s.speciesName)}" to a known species -- check the spelling.</div>`;
  } else {
    worthBlock = `<div class="reason">${categoryBreakdown(worth)}</div>`;
    const tier = worth.bestCategory ? worth.bestCategory.tier : VERDICT_TIER[worth.verdict];
    badge = `<span class="tier-badge tier-${tier}">${worth.verdict}</span>`;
    dex = worth.dex;
    types = worth.types;
    moveset = worth.moveset;
  }

  return `
    <div class="card">
      <div class="rank">·</div>
      ${spriteSlot(dex, s.canBeShiny)}
      <div>
        <div class="name">
          ${escapeHtml(s.speciesName)}
          ${typeChips(types)}
          ${s.canBeShiny ? '<span class="shiny-badge">shiny</span>' : ""}
        </div>
        ${movesetRow(moveset)}
        <div class="sources">${when}</div>
        ${s.note ? `<div class="reason">${escapeHtml(s.note)}</div>` : ""}
        ${worthBlock}
      </div>
      <div>
        ${badge}
        <button class="remove-btn" data-remove-id="${s.id}">Remove</button>
      </div>
    </div>
  `;
}

function renderSightingsTab() {
  const filteredWildEncounters = scoreboard ? filterBySearch(scoreboard.wildEncounters) : [];
  const communitySection = scoreboard
    ? `
      <p class="tab-note">Community Day and Spotlight Hour spawns happening this month. Only officially announced events are shown.</p>
      ${renderList(filteredWildEncounters, "verdict")}
    `
    : `<div class="empty">${POKEBALL_PLACEHOLDER_SVG.replace('class="sprite-placeholder"', 'class="pokeball-spin spinning"')}<span>Loading upcoming community events...</span></div>`;

  const form = `
    <form id="sighting-form" class="sighting-form">
      <input type="text" name="speciesName" placeholder="Species you just saw (e.g. Meowth)" required maxlength="80" />
      <input type="text" name="note" placeholder="Note (optional)" maxlength="200" />
      <label class="shiny-checkbox"><input type="checkbox" name="canBeShiny" /> Shiny</label>
      <button type="submit">Log sighting</button>
    </form>
  `;
  const filteredSightings = filterBySearch(sightings);
  const list =
    sightings.length === 0
      ? '<div class="empty">No sightings yet — log what you catch above. This is your own private log.</div>'
      : filteredSightings.length === 0
        ? '<div class="empty">No logged sightings match that search.</div>'
        : filteredSightings.map(renderSightingItem).join("");

  return `
    ${searchBoxHtml()}
    <details class="community-spawns-details" open>
      <summary class="group-heading">This Month's Community Spawns</summary>
      ${communitySection}
    </details>
    <h2 class="group-heading">My Sightings</h2>
    <p class="tab-note">Your own wild-encounter log — track what you actually catch out in the world.</p>
    ${form}
    ${list}
  `;
}

// Compact row used only on the dashboard's panels -- sprite + name + one badge,
// none of the movesets/IVs/full breakdown text the detail-view cards show.
function renderCompactItem(species, tier, label) {
  const badge = tier != null ? `<span class="tier-badge tier-${tier}">${escapeHtml(label || `Tier ${tier}`)}</span>` : "";
  return `
    <div class="compact-item">
      ${spriteSlot(species.dex, species.canBeShiny)}
      <div class="compact-name">${escapeHtml(species.speciesName)}${species.canBeShiny ? ' <span class="shiny-badge">shiny</span>' : ""}</div>
      ${badge}
    </div>
  `;
}

function panelHtml(title, gotoTab, bodyHtml, extraClass) {
  return `
    <div class="panel${extraClass ? ` ${extraClass}` : ""}">
      <div class="panel-header">
        <h3>${title}</h3>
        <button class="panel-view-all" data-goto="${gotoTab}">View all &rarr;</button>
      </div>
      ${bodyHtml}
    </div>
  `;
}

// A single live/upcoming event as shown in the dashboard's top hero section --
// more detail than a compact-item (dates, event type) since this section has
// room for it, but lighter than the full news-tab card.
function renderDashboardNewsItem(item) {
  const badge =
    item.status === "live"
      ? '<span class="tier-badge tier-1">Live</span>'
      : `<span class="tier-badge tier-3">Starts ${new Date(item.start).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>`;
  return `
    <a class="hero-item" href="${safeHref(item.link)}" target="_blank" rel="noopener noreferrer">
      <div class="hero-item-top">
        <span class="hero-item-name">${escapeHtml(item.name)}</span>
        ${badge}
      </div>
      <div class="hero-item-meta">${escapeHtml(eventTypeLabel(item.eventType))} &middot; ${formatEventWindow(item.start, item.end)}</div>
    </a>
  `;
}

// Full-width section pinned above the panel grid so up to 3 live/upcoming
// events have room to show their dates and event type, not just a name.
function renderLiveUpcomingSection() {
  const upcoming = scoreboard.news.upcoming.slice(0, 3);
  const body = upcoming.length
    ? `<div class="hero-grid">${upcoming.map(renderDashboardNewsItem).join("")}</div>`
    : '<div class="panel-empty">Nothing live or starting soon.</div>';
  return `
    <div class="panel hero-panel">
      <div class="panel-header">
        <h3>Live &amp; Upcoming</h3>
        <button class="panel-view-all" data-goto="news">View all &rarr;</button>
      </div>
      ${body}
    </div>
  `;
}

function renderDashboard() {
  if (!scoreboard) {
    return `<div class="empty">${POKEBALL_PLACEHOLDER_SVG.replace('class="sprite-placeholder"', 'class="pokeball-spin spinning"')}<span>Loading...</span></div>`;
  }

  const notablePanel = panelHtml(
    "Overall",
    "notable",
    scoreboard.notable.length
      ? scoreboard.notable.slice(0, 5).map((s) => renderCompactItem(s, s.bestCategory?.tier, s.verdict)).join("")
      : '<div class="panel-empty">Nothing notable right now.</div>',
  );

  const raidBossesPanel = panelHtml(
    "Raid Bosses",
    "raidBosses",
    scoreboard.raidBosses.length
      ? scoreboard.raidBosses.slice(0, 5).map((s) => renderCompactItem(s, s.bestCategory?.tier, s.verdict)).join("")
      : '<div class="panel-empty">No raid bosses right now.</div>',
  );

  const raidAttackerPanel = panelHtml(
    "Raid Attacker",
    "raid",
    scoreboard.raid.length
      ? scoreboard.raid.slice(0, 5).map((s) => renderCompactItem(s, s.raidAttacker?.tier)).join("")
      : '<div class="panel-empty">Nothing ranked right now.</div>',
  );

  const gymDefensePanel = panelHtml(
    "Gym Defense",
    "gymDefense",
    scoreboard.gymDefense.length
      ? scoreboard.gymDefense.slice(0, 5).map((s) => renderCompactItem(s, s.gymDefender?.tier)).join("")
      : '<div class="panel-empty">Nothing ranked right now.</div>',
  );

  const pvpRows = [
    ["great", "Great"],
    ["ultra", "Ultra"],
    ["master", "Master"],
  ]
    .map(([key, label]) => {
      const top = scoreboard.pvp[key][0];
      const body = top
        ? renderCompactItem(top, top.pvpByLeague[key]?.tier)
        : '<div class="panel-empty">Nothing ranked</div>';
      return `<div class="pvp-mini-row"><span class="pvp-mini-label">${label}</span>${body}</div>`;
    })
    .join("");
  const pvpPanel = panelHtml("PvP", "pvp", pvpRows);

  const stardustEntries = scoreboard.stardust;
  const stardustPanel = panelHtml(
    "Stardust Bonus",
    "stardust",
    stardustEntries.length
      ? stardustEntries.slice(0, 3).map((s) => renderCompactItem(s, s.stardust?.tier)).join("")
      : '<div class="panel-empty">Nothing active right now.</div>',
    "panel-banner",
  );

  const sightingsBody = sightings.length
    ? sightings
        .slice(0, 3)
        .map((s) => `<div class="compact-item"><div class="compact-name">${escapeHtml(s.speciesName)}</div></div>`)
        .join("") + `<div class="panel-empty">${sightings.length} logged</div>`
    : '<div class="panel-empty">No sightings logged yet.</div>';
  const sightingsPanel = panelHtml("My Sightings", "sightings", sightingsBody);

  return `${renderLiveUpcomingSection()}<div class="dashboard-grid">${notablePanel}${raidBossesPanel}${raidAttackerPanel}${gymDefensePanel}${pvpPanel}${stardustPanel}${sightingsPanel}</div>`;
}

function backLinkHtml() {
  return `<button class="back-to-dashboard" id="back-to-dashboard">&larr; Dashboard</button>`;
}

function renderDetailBody() {
  if (activeTab === "sightings") {
    return renderSightingsTab();
  }

  if (!scoreboard) {
    return `<div class="empty">${POKEBALL_PLACEHOLDER_SVG.replace('class="sprite-placeholder"', 'class="pokeball-spin spinning"')}<span>Loading...</span></div>`;
  }

  if (activeTab === "raidBosses") {
    const filtered = filterBySearch(scoreboard.raidBosses);
    const groups = new Map();
    for (const s of filtered) {
      const tierLabel = s.sources.find((src) => src.type === "raid")?.detail ?? "Raid";
      if (!groups.has(tierLabel)) groups.set(tierLabel, []);
      groups.get(tierLabel).push(s);
    }
    const sortedGroups = [...groups.entries()].sort((a, b) => {
      const diff = raidTierRank(a[0]) - raidTierRank(b[0]);
      return raidTierSortDir === "asc" ? diff : -diff;
    });

    const sortControl = `
      <div class="tier-sort-control">
        <label for="raid-tier-sort">Sort by star tier</label>
        <select id="raid-tier-sort">
          <option value="asc" ${raidTierSortDir === "asc" ? "selected" : ""}>1-Star &rarr; 5-Star</option>
          <option value="desc" ${raidTierSortDir === "desc" ? "selected" : ""}>5-Star &rarr; 1-Star</option>
        </select>
      </div>
    `;

    return (
      searchBoxHtml() +
      sortControl +
      (sortedGroups.length
        ? sortedGroups.map(([tierLabel, list]) => `<h2 class="group-heading">${tierLabel}</h2>${renderList(list, "verdict")}`).join("")
        : renderList([]))
    );
  }

  if (activeTab === "news") {
    return renderNewsTab(newsView);
  }

  if (activeTab === "stardust") {
    return `
      <p class="tab-note">Species with an active bonus-stardust event right now — a Community Day 3&times; Catch Stardust bonus, or a Stardust Spotlight Hour. Often empty; that's normal.</p>
      ${searchBoxHtml()}
      ${renderList(filterBySearch(scoreboard.stardust), "stardust")}
    `;
  }

  if (activeTab === "pvp") {
    const allLeagues = [
      ["great", "Great League"],
      ["ultra", "Ultra League"],
      ["master", "Master League"],
    ];
    const leagues = pvpLeagueFilter === "all" ? allLeagues : allLeagues.filter(([key]) => key === pvpLeagueFilter);

    const filterControl = `
      <div class="tier-sort-control">
        <label for="pvp-league-filter">Show league</label>
        <select id="pvp-league-filter">
          <option value="all" ${pvpLeagueFilter === "all" ? "selected" : ""}>All Leagues</option>
          ${allLeagues
            .map(([key, label]) => `<option value="${key}" ${pvpLeagueFilter === key ? "selected" : ""}>${label}</option>`)
            .join("")}
        </select>
      </div>
    `;

    return (
      `<p class="tab-note">Ranked separately per league -- a Pokemon good in more than one league shows up in each. Values reflect its best reachable evolution.</p>` +
      searchBoxHtml() +
      filterControl +
      leagues
        .map(([key, label]) => {
          const list = filterBySearch(scoreboard.pvp[key]);
          const body = list.length
            ? list.map((s, i) => renderPvpLeagueCard(s, i, key)).join("")
            : '<div class="empty">Nothing ranks here right now.</div>';
          return `<h2 class="group-heading">${label}</h2>${body}`;
        })
        .join("")
    );
  }

  let list;
  let categoryKey;
  if (activeTab === "notable") {
    list = scoreboard.notable;
    categoryKey = null;
  } else {
    categoryKey = CATEGORY_KEY[activeTab];
    list = scoreboard[activeTab];
  }

  return searchBoxHtml() + renderList(filterBySearch(list), categoryKey);
}

function render() {
  const content = document.getElementById("content");
  if (view === "dashboard") {
    content.innerHTML = renderDashboard();
    return;
  }
  content.innerHTML = backLinkHtml() + renderDetailBody();
}

function goToDetail(tab) {
  activeTab = tab;
  view = "detail";
  searchQuery = "";
  render();
}

function goToDashboard() {
  view = "dashboard";
  render();
}

const contentEl = document.getElementById("content");

contentEl.addEventListener("submit", async (e) => {
  if (e.target.id !== "sighting-form") return;
  e.preventDefault();
  const form = e.target;
  const speciesName = form.speciesName.value.trim();
  if (!speciesName) return;

  const res = await fetch("/api/sightings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      speciesName,
      note: form.note.value.trim(),
      canBeShiny: form.canBeShiny.checked,
    }),
  });
  if (res.ok) {
    await loadSightings();
    render();
  }
});

contentEl.addEventListener("click", async (e) => {
  const removeBtn = e.target.closest("[data-remove-id]");
  if (removeBtn) {
    const res = await fetch(`/api/sightings/${removeBtn.dataset.removeId}`, { method: "DELETE" });
    if (res.ok || res.status === 404) {
      await loadSightings();
      render();
    }
    return;
  }

  const gotoBtn = e.target.closest("[data-goto]");
  if (gotoBtn) {
    goToDetail(gotoBtn.dataset.goto);
    return;
  }

  if (e.target.closest("#back-to-dashboard")) {
    goToDashboard();
  }
});

contentEl.addEventListener("change", (e) => {
  if (e.target.id === "raid-tier-sort") {
    raidTierSortDir = e.target.value;
    render();
  } else if (e.target.id === "pvp-league-filter") {
    pvpLeagueFilter = e.target.value;
    render();
  } else if (e.target.id === "news-view-select") {
    newsView = e.target.value;
    render();
  }
});

contentEl.addEventListener("input", (e) => {
  if (e.target.id !== "species-search") return;
  searchQuery = e.target.value;
  const cursorPos = e.target.selectionStart;
  render();
  const newInput = document.getElementById("species-search");
  if (newInput) {
    newInput.focus();
    newInput.setSelectionRange(cursorPos, cursorPos);
  }
});

async function loadSightings() {
  try {
    const res = await fetch("/api/sightings");
    if (res.ok) sightings = await res.json();
  } catch {
    // sightings are a local convenience feature; leave the list as-is on failure
  }
}

async function load() {
  try {
    const res = await fetch("/api/scoreboard.json");
    if (!res.ok) throw new Error(`http ${res.status}`);
    scoreboard = await res.json();
    document.getElementById("generated-at").textContent =
      "Updated " + new Date(scoreboard.generatedAt).toLocaleString();
    document.getElementById("attribution").innerHTML = scoreboard.attribution
      .map((a) => `<div>${a}</div>`)
      .join("");
    render();
  } catch (err) {
    console.error("Failed to load scoreboard:", err);
    document.getElementById("content").innerHTML =
      '<div class="empty">The dashboard data isn\'t available right now — please check back soon.</div>';
  }
}

loadSightings().then(() => {
  if (view === "dashboard" || activeTab === "sightings") render();
});
load();

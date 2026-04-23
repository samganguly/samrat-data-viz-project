const REGION_COLORS = {
  "East Asia & Pacific": "#0072B2",
  "Europe & Central Asia": "#E69F00",
  "Latin America & Caribbean": "#009E73",
  "Middle East & North Africa": "#CC79A7",
  "North America": "#56B4E9",
  "South Asia": "#D55E00",
  "Sub-Saharan Africa": "#B79F00",
};

const SEMANTIC_COLORS = {
  positive: "#0072B2",
  negative: "#D55E00",
  neutral: "#6B7280",
  schoolPositive: "#009E73",
  tertiaryPositive: "#0072B2",
};

const DATA_FILES = {
  core: "/data/q_analysis_core.csv",
  country: "/data/q_country_summary.csv",
  spend: "/data/q_q4_spend.csv",
  gini: "/data/q_q4_gini.csv",
  yearSummary: "/data/q_year_summary.csv",
  yearRegionSummary: "/data/q_year_region_summary.csv",
};

const state = {
  datasets: {},
  years: [],
  regions: [],
  incomeGroups: [],
  theme: "light",
  q1ScatterMetric: "school",
  q1TrendMetric: "school",
  q1RegionalMetric: "school",
  filters: {
    q1: { year: null, region: "all", income: "all" },
    q2: { year: null, region: "all", income: "all" },
    q3: { region: "all", income: "all" },
    q4: { year: null, region: "all", income: "all" },
  },
  q3Metric: "school",
  q4SpendMetric: "school",
  q4GiniMetric: "school",
};

const tooltip = d3.select("#tooltip");
const chartAnimations = new Map();
let chartObserver = null;
let revealObserver = null;
let metricObserver = null;
let q1PlaybackTimer = null;

document.addEventListener("DOMContentLoaded", init);
window.addEventListener("resize", debounce(renderAll, 180));

async function init() {
  initTheme();
  const [core, country, spend, gini, yearSummary, yearRegionSummary] = await Promise.all([
    d3.csv(DATA_FILES.core, d3.autoType),
    d3.csv(DATA_FILES.country, d3.autoType),
    d3.csv(DATA_FILES.spend, d3.autoType),
    d3.csv(DATA_FILES.gini, d3.autoType),
    d3.csv(DATA_FILES.yearSummary, d3.autoType),
    d3.csv(DATA_FILES.yearRegionSummary, d3.autoType),
  ]);

  state.datasets = { core, country, spend, gini, yearSummary, yearRegionSummary };
  state.years = d3.sort([...new Set(core.map((row) => row.year))]).filter((value) => value != null);
  state.regions = d3.sort([...new Set(core.map((row) => row.region))]).filter(Boolean);
  state.incomeGroups = d3
    .sort([...new Set(core.map((row) => row.income_group))])
    .filter(Boolean);

  const latestYear = state.years[state.years.length - 1];
  state.filters.q1.year = latestYear;
  state.filters.q2.year = latestYear;
  state.filters.q4.year = latestYear;

  setupObservers();
  renderCoverage();
  renderLegends();
  renderPaletteWidget();
  populateControls();
  bindEvents();
  setupMotionEnhancements();
  renderAll();
}

function initTheme() {
  const storedTheme = window.localStorage.getItem("wealth-theme");
  const preferredDark =
    window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  state.theme = storedTheme || (preferredDark ? "dark" : "light");
  applyTheme();
}

function applyTheme() {
  document.documentElement.setAttribute("data-theme", state.theme);
  const label = document.getElementById("themeToggleLabel");
  if (label) {
    label.textContent = state.theme === "dark" ? "Light mode" : "Dark mode";
  }
}

function setupObservers() {
  revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
        }
      });
    },
    { threshold: 0.18 }
  );

  chartObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = entry.target.id;
        const animate = chartAnimations.get(id);
        if (animate && entry.target.dataset.animated !== "true") {
          entry.target.dataset.animated = "true";
          animate();
        }
      });
    },
    { threshold: 0.28 }
  );

  document.querySelectorAll(".card, .topic-card").forEach((node) => {
    node.classList.add("animate-on-scroll");
    revealObserver.observe(node);
  });
}

function renderCoverage() {
  const { core } = state.datasets;
  setAnimatedMetric("coverageCoreRows", core.length);
  setAnimatedMetric("coverageCountries", new Set(core.map((row) => row.iso3)).size);
  setAnimatedMetric("coverageRegions", state.regions.length);
  setAnimatedMetric("coverageIncomeGroups", state.incomeGroups.length);

  if (!metricObserver) {
    setupMetricCounters();
  }
}

function renderLegends() {
  const markup = Object.entries(REGION_COLORS)
    .map(
      ([region, color]) => `
        <span class="legend-item">
          <span class="legend-swatch" style="background:${color}"></span>
          <span>${escapeHtml(region)}</span>
        </span>
      `
    )
    .join("");

  ["q1Legend", "q2Legend", "q3Legend", "q4Legend"].forEach((id) => {
    document.getElementById(id).innerHTML = markup;
  });
}

function renderPaletteWidget() {
  const markup = Object.entries(REGION_COLORS)
    .map(
      ([region, color]) => `
        <div class="palette-swatch">
          <span class="palette-swatch-chip" style="background:${color}"></span>
          <span>${escapeHtml(region)}</span>
        </div>
      `
    )
    .join("");
  document.getElementById("paletteSwatches").innerHTML = markup;
}

function populateControls() {
  populateYearSelect("q1YearFilter", state.filters.q1.year);
  populateYearSelect("q2YearFilter", state.filters.q2.year);
  populateYearSelect("q4YearFilter", state.filters.q4.year);

  populateSelect("q1RegionFilter", state.regions, state.filters.q1.region, "All regions");
  populateSelect("q2RegionFilter", state.regions, state.filters.q2.region, "All regions");
  populateSelect("q3RegionFilter", state.regions, state.filters.q3.region, "All regions");
  populateSelect("q4RegionFilter", state.regions, state.filters.q4.region, "All regions");

  populateSelect("q1IncomeFilter", state.incomeGroups, state.filters.q1.income, "All income groups");
  populateSelect("q2IncomeFilter", state.incomeGroups, state.filters.q2.income, "All income groups");
  populateSelect("q3IncomeFilter", state.incomeGroups, state.filters.q3.income, "All income groups");
  populateSelect("q4IncomeFilter", state.incomeGroups, state.filters.q4.income, "All income groups");
}

function populateYearSelect(id, selected) {
  const select = document.getElementById(id);
  select.innerHTML = state.years
    .map((year) => `<option value="${year}" ${year === selected ? "selected" : ""}>${year}</option>`)
    .join("");
}

function populateSelect(id, values, selected, allLabel) {
  const select = document.getElementById(id);
  const options = [
    `<option value="all" ${selected === "all" ? "selected" : ""}>${escapeHtml(allLabel)}</option>`,
    ...values.map(
      (value) =>
        `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(value)}</option>`
    ),
  ];
  select.innerHTML = options.join("");
}

function bindEvents() {
  const reportOverlay = document.getElementById("reportOverlay");
  const reportDialog = reportOverlay?.querySelector(".report-dialog");

  if (reportOverlay) {
    reportOverlay.hidden = true;
  }

  document.getElementById("themeToggle").addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    window.localStorage.setItem("wealth-theme", state.theme);
    applyTheme();
    renderAll();
  });

  document.getElementById("paletteWidgetToggle").addEventListener("click", togglePaletteWidget);
  document.getElementById("paletteWidgetClose").addEventListener("click", minimizePaletteWidget);
  document.getElementById("reportOpen").addEventListener("click", openReportOverlay);
  document.getElementById("reportClose").addEventListener("click", closeReportOverlay);
  document.getElementById("reportBackdrop").addEventListener("click", closeReportOverlay);
  reportDialog?.addEventListener("click", (event) => event.stopPropagation());
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeReportOverlay();
    }
  });

  bindFilterGroup("q1", ["Year", "Region", "Income"]);
  bindFilterGroup("q2", ["Year", "Region", "Income"]);
  bindFilterGroup("q4", ["Year", "Region", "Income"]);

  document.getElementById("q3RegionFilter").addEventListener("change", (event) => {
    state.filters.q3.region = event.target.value;
    renderQ3();
  });
  document.getElementById("q3IncomeFilter").addEventListener("change", (event) => {
    state.filters.q3.income = event.target.value;
    renderQ3();
  });
  document.getElementById("q3ResetFilters").addEventListener("click", () => {
    state.filters.q3.region = "all";
    state.filters.q3.income = "all";
    populateControls();
    renderQ3();
  });

  document.getElementById("q3MetricTabs").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-metric]");
    if (!button) {
      return;
    }

    state.q3Metric = button.dataset.metric;
    document
      .querySelectorAll("#q3MetricTabs button[data-metric]")
      .forEach((node) => node.classList.toggle("is-active", node.dataset.metric === state.q3Metric));
    renderQ3();
  });

  bindMetricTabs("q1ScatterMetricTabs", "q1ScatterMetric", renderQ1);
  bindMetricTabs("q1TrendMetricTabs", "q1TrendMetric", renderQ1);
  bindMetricTabs("q1RegionalMetricTabs", "q1RegionalMetric", renderQ1);
  bindMetricTabs("q4SpendMetricTabs", "q4SpendMetric", renderQ4);
  bindMetricTabs("q4GiniMetricTabs", "q4GiniMetric", renderQ4);

  document.getElementById("q1YearPlay").addEventListener("click", startQ1Playback);
  document.getElementById("q1YearPause").addEventListener("click", stopQ1Playback);
}

function bindFilterGroup(sectionKey, parts) {
  parts.forEach((part) => {
    const id = `${sectionKey}${part}Filter`;
    document.getElementById(id).addEventListener("change", (event) => {
      const targetKey = part.toLowerCase();
      state.filters[sectionKey][targetKey] =
        targetKey === "year" ? Number(event.target.value) : event.target.value;
      if (sectionKey === "q1") {
        stopQ1Playback();
      }
      renderSection(sectionKey);
    });
  });

  document.getElementById(`${sectionKey}ResetFilters`).addEventListener("click", () => {
    const latestYear = state.years[state.years.length - 1];
    if ("year" in state.filters[sectionKey]) {
      state.filters[sectionKey].year = latestYear;
    }
    state.filters[sectionKey].region = "all";
    state.filters[sectionKey].income = "all";
    if (sectionKey === "q1") {
      stopQ1Playback();
    }
    populateControls();
    renderSection(sectionKey);
  });
}

function bindMetricTabs(containerId, stateKey, renderFn) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-metric]");
    if (!button) {
      return;
    }

    state[stateKey] = button.dataset.metric;
    container
      .querySelectorAll("button[data-metric]")
      .forEach((node) => node.classList.toggle("is-active", node.dataset.metric === state[stateKey]));
    renderFn();
  });
}

function startQ1Playback() {
  if (q1PlaybackTimer) {
    return;
  }

  const firstYear = state.years[0];
  const lastYear = state.years[state.years.length - 1];
  if (state.filters.q1.year >= lastYear) {
    state.filters.q1.year = firstYear;
    populateControls();
    renderQ1();
  }

  q1PlaybackTimer = window.setInterval(() => {
    const currentIndex = state.years.indexOf(state.filters.q1.year);
    if (currentIndex === -1 || currentIndex >= state.years.length - 1) {
      stopQ1Playback();
      return;
    }

    state.filters.q1.year = state.years[currentIndex + 1];
    populateControls();
    renderQ1();
  }, 1100);

  updatePlaybackButtons();
}

function stopQ1Playback() {
  if (q1PlaybackTimer) {
    window.clearInterval(q1PlaybackTimer);
    q1PlaybackTimer = null;
  }
  updatePlaybackButtons();
}

function updatePlaybackButtons() {
  const playButton = document.getElementById("q1YearPlay");
  const pauseButton = document.getElementById("q1YearPause");
  if (!playButton || !pauseButton) return;

  const isPlaying = Boolean(q1PlaybackTimer);
  playButton.classList.toggle("is-active", isPlaying);
  playButton.disabled = isPlaying;
  pauseButton.disabled = !isPlaying;
}

function renderAll() {
  renderQ1();
  renderQ2();
  renderQ3();
  renderQ4();
}

function renderSection(sectionKey) {
  if (sectionKey === "q1") renderQ1();
  if (sectionKey === "q2") renderQ2();
  if (sectionKey === "q3") renderQ3();
  if (sectionKey === "q4") renderQ4();
}

function renderQ1() {
  const filtered = filterCountryYearRows(state.datasets.core, state.filters.q1);
  const schoolStats = relationshipStats(filtered, "log_wealth_pc", "school_life_expectancy");
  const tertiaryStats = relationshipStats(filtered, "log_wealth_pc", "tertiary_enrolment_rate");
  const schoolTrend = lineChangeStats(state.datasets.yearSummary, "median_school_life_expectancy");
  const tertiaryTrend = lineChangeStats(state.datasets.yearSummary, "median_tertiary_enrolment_rate");
  const regionalSchool = regionalLatestSummary("median_school_life_expectancy");
  const regionalTertiary = regionalLatestSummary("median_tertiary_enrolment_rate");
  const schoolYearly = yearlyRelationshipSummary(state.datasets.core, "log_wealth_pc", "school_life_expectancy");
  const tertiaryYearly = yearlyRelationshipSummary(state.datasets.core, "log_wealth_pc", "tertiary_enrolment_rate");

  document.getElementById("q1Insight").innerHTML = `
    <strong>Current Wealth and Education View</strong>
    <p>
      For ${state.filters.q1.year}, wealth-to-school is ${relationshipSummaryShort(
        schoolStats
      )}, while wealth-to-tertiary is ${relationshipSummaryShort(tertiaryStats)}. Across the full 1995-2018 panel,
      the yearly school correlation stays between ${formatSignedDecimal(schoolYearly.minR, 2)} and ${formatSignedDecimal(
        schoolYearly.maxR,
        2
      )}, and the yearly tertiary correlation stays between ${formatSignedDecimal(
        tertiaryYearly.minR,
        2
      )} and ${formatSignedDecimal(tertiaryYearly.maxR, 2)}. That means the wealth-education link stays strong over
      time rather than appearing only in one or two years.
    </p>
  `;

  const scatterMetric = state.q1ScatterMetric;
  const scatterConfig =
    scatterMetric === "school"
      ? {
          title: "Wealth and school life expectancy",
          yKey: "school_life_expectancy",
          yLabel: "School life expectancy (years)",
          stats: schoolStats,
          tooltipHtml: (row) => `
            <strong>${escapeHtml(row.country_display)}</strong><br>
            Year: ${row.year}<br>
            Region: ${escapeHtml(row.region)}<br>
            Wealth per capita: ${formatCurrency(row.wealth_pc)}<br>
            School life expectancy: ${formatNumber(row.school_life_expectancy, 2)}<br>
            Human capital share: ${formatPercent(row.human_capital_share, 1)}<br>
            Natural capital share: ${formatPercent(row.natural_capital_share, 1)}<br>
            Produced capital share: ${formatPercent(row.produced_capital_share, 1)}
          `,
          explanationId: "q1ScatterExplain",
          explanation: buildHypothesisExplanation({
            stats: schoolStats,
            expectedDirection: "positive",
            insufficient:
              "This scatter is the right visual for the year-specific part of the first research question, but the current filter leaves too few usable country-year observations to estimate a reliable wealth-to-school relationship.",
            weak:
              "This chart asks whether countries further to the right on the wealth axis also sit higher on school life expectancy. In the current filtered slice that pattern is weak, so this specific view does not strongly support a tight wealth-school link.",
            support:
              "This chart asks whether countries further to the right on the wealth axis also sit higher on school life expectancy. In the current view they generally do, so the selected year shows a clear positive relationship between wealth and school life expectancy.",
            contradict:
              "This chart still answers the year-specific part of the first research question, but in the current filtered slice the fitted relationship turns negative. That means this specific selection does not support the broader expectation that wealth and school life expectancy move together."
          }),
        }
      : {
          title: "Wealth and tertiary enrolment rate",
          yKey: "tertiary_enrolment_rate",
          yLabel: "Tertiary enrolment rate",
          stats: tertiaryStats,
          tooltipHtml: (row) => `
            <strong>${escapeHtml(row.country_display)}</strong><br>
            Year: ${row.year}<br>
            Region: ${escapeHtml(row.region)}<br>
            Wealth per capita: ${formatCurrency(row.wealth_pc)}<br>
            Tertiary enrolment: ${formatNumber(row.tertiary_enrolment_rate, 2)}<br>
            Human capital share: ${formatPercent(row.human_capital_share, 1)}<br>
            Natural capital share: ${formatPercent(row.natural_capital_share, 1)}<br>
            Produced capital share: ${formatPercent(row.produced_capital_share, 1)}
          `,
          explanationId: "q1ScatterExplain",
          explanation: buildHypothesisExplanation({
            stats: tertiaryStats,
            expectedDirection: "positive",
            insufficient:
              "This chart is meant to test whether the broader wealth pattern also appears for higher education participation, but the current filter leaves too few usable observations to estimate that relationship reliably.",
            weak:
              "This chart checks whether richer countries also tend to have higher tertiary enrolment. In the current slice the points are more spread out, so the pattern is weak and only limited support comes from this view.",
            support:
              "This chart checks whether richer countries also tend to have higher tertiary enrolment. In the current view the cloud still slopes upward, so tertiary participation rises with wealth, although the pattern is looser than for school life expectancy.",
            contradict:
              "This chart still addresses the higher-education side of the first research question, but in the current filtered slice the relationship turns negative. That means this particular subset does not support the broader expectation that tertiary enrolment rises with wealth."
          }),
        };

  document.getElementById("q1ScatterTitle").textContent = scatterConfig.title;
  drawScatterChart({
    containerId: "q1ScatterMain",
    data: filtered,
    xKey: "log_wealth_pc",
    yKey: scatterConfig.yKey,
    sizeKey: "population_total",
    xLabel: "Log wealth per capita",
    yLabel: scatterConfig.yLabel,
    statLabel: scatterConfig.stats,
    tooltipHtml: scatterConfig.tooltipHtml,
  });
  setExplain(scatterConfig.explanationId, scatterConfig.explanation);

  const trendMetric = state.q1TrendMetric;
  const trendConfig =
    trendMetric === "school"
      ? {
          title: "Median school life expectancy over time",
          series: [
            {
              name: "Global median school life expectancy",
              color: trendStrokeColor(schoolTrend.delta, SEMANTIC_COLORS.schoolPositive),
              values: state.datasets.yearSummary.map((row) => ({
                x: row.year,
                y: row.median_school_life_expectancy,
              })),
            },
          ],
          yLabel: "Median school life expectancy",
          explanation: `This line chart shows the global median school life expectancy moving from <strong>${formatNumber(
            schoolTrend.start,
            2
          )}</strong> to <strong>${formatNumber(
            schoolTrend.end,
            2
          )}</strong>. Because the line ${schoolTrend.delta >= 0 ? "ends higher than it starts" : "ends lower than it starts"}, the data suggest ${schoolTrend.delta >= 0 ? "a broad improvement over time" : "a net decline over time"} rather than a purely cross-sectional rich-versus-poor pattern.`,
        }
      : {
          title: "Median tertiary enrolment over time",
          series: [
            {
              name: "Global median tertiary enrolment",
              color: trendStrokeColor(tertiaryTrend.delta, SEMANTIC_COLORS.tertiaryPositive),
              values: state.datasets.yearSummary.map((row) => ({
                x: row.year,
                y: row.median_tertiary_enrolment_rate,
              })),
            },
          ],
          yLabel: "Median tertiary enrolment rate",
          explanation: `This line chart shows the global median tertiary enrolment rate moving from <strong>${formatNumber(
            tertiaryTrend.start,
            2
          )}</strong> to <strong>${formatNumber(
            tertiaryTrend.end,
            2
          )}</strong>. The overall ${tertiaryTrend.delta >= 0 ? "upward" : "downward"} shift indicates whether higher education participation was expanding or contracting across the period covered by the summary table.`,
        };
  document.getElementById("q1TrendTitle").textContent = trendConfig.title;
  drawLineChart({
    containerId: "q1TrendMain",
    series: trendConfig.series,
    xLabel: "Year",
    yLabel: trendConfig.yLabel,
  });
  setExplain("q1TrendExplain", trendConfig.explanation);

  const regionalMetric = state.q1RegionalMetric;
  const regionalConfig =
    regionalMetric === "school"
      ? {
          title: "Regional school life expectancy over time",
          series: buildRegionalSeries("median_school_life_expectancy"),
          yLabel: "Median school life expectancy",
          explanation: `This regional chart shows whether improvement is shared across regions or concentrated in only a few. In the latest available year, <strong>${escapeHtml(
            regionalSchool.top.region
          )}</strong> has the highest median school life expectancy and <strong>${escapeHtml(
            regionalSchool.bottom.region
          )}</strong> the lowest, so the visual is most useful for discussing persistent regional gaps as well as change over time.`,
        }
      : {
          title: "Regional tertiary enrolment over time",
          series: buildRegionalSeries("median_tertiary_enrolment_rate"),
          yLabel: "Median tertiary enrolment rate",
          explanation: `This regional chart compares how tertiary enrolment changes across regions over time. It shows which regions stay highest, which improve faster, and whether regional gaps narrow or remain wide, so the main value of this view is comparison rather than one overall average.`,
        };
  document.getElementById("q1RegionalTitle").textContent = regionalConfig.title;
  drawLineChart({
    containerId: "q1RegionalMain",
    series: regionalConfig.series,
    xLabel: "Year",
    yLabel: regionalConfig.yLabel,
    labelLineEnds: true,
  });
  setExplain("q1RegionalExplain", regionalConfig.explanation);
  updatePlaybackButtons();
}

function renderQ2() {
  const filtered = filterCountryYearRows(state.datasets.core, state.filters.q2);
  const humanStats = relationshipStats(filtered, "human_capital_share", "school_life_expectancy");
  const naturalStats = relationshipStats(filtered, "natural_capital_share", "school_life_expectancy");
  const producedStats = relationshipStats(filtered, "produced_capital_share", "tertiary_enrolment_rate");
  const humanStandouts = computeScatterStandouts(
    filtered,
    "human_capital_share",
    "school_life_expectancy",
    humanStats
  );
  const naturalStandouts = computeScatterStandouts(
    filtered,
    "natural_capital_share",
    "school_life_expectancy",
    naturalStats
  );
  const producedStandouts = computeScatterStandouts(
    filtered,
    "produced_capital_share",
    "tertiary_enrolment_rate",
    producedStats
  );

  document.getElementById("q2Insight").innerHTML = `
    <strong>Current Wealth Structure View</strong>
    <p>
      In the selected slice, human capital is ${relationshipSummaryShort(humanStats)},
      natural capital is ${relationshipSummaryShort(naturalStats)},
      and produced capital is ${relationshipSummaryShort(producedStats)} for tertiary enrolment.
      This research question is well served here because each chart directly compares one wealth component with one education outcome.
    </p>
  `;

  drawScatterChart({
    containerId: "q2HumanSchool",
    data: filtered,
    xKey: "human_capital_share",
    yKey: "school_life_expectancy",
    sizeKey: "population_total",
    xLabel: "Human capital share",
    yLabel: "School life expectancy (years)",
    statLabel: humanStats,
    percentX: true,
    highlightedNames: humanStandouts,
    labelKey: "country_display",
    tooltipHtml: (row) => `
      <strong>${escapeHtml(row.country_display)}</strong><br>
      Year: ${row.year}<br>
      Human capital share: ${formatPercent(row.human_capital_share, 1)}<br>
      School life expectancy: ${formatNumber(row.school_life_expectancy, 2)}<br>
      Log wealth per capita: ${formatNumber(row.log_wealth_pc, 2)}
    `,
  });

  drawScatterChart({
    containerId: "q2NaturalSchool",
    data: filtered,
    xKey: "natural_capital_share",
    yKey: "school_life_expectancy",
    sizeKey: "population_total",
    xLabel: "Natural capital share",
    yLabel: "School life expectancy (years)",
    statLabel: naturalStats,
    percentX: true,
    highlightedNames: naturalStandouts,
    labelKey: "country_display",
    tooltipHtml: (row) => `
      <strong>${escapeHtml(row.country_display)}</strong><br>
      Year: ${row.year}<br>
      Natural capital share: ${formatPercent(row.natural_capital_share, 1)}<br>
      School life expectancy: ${formatNumber(row.school_life_expectancy, 2)}<br>
      Log wealth per capita: ${formatNumber(row.log_wealth_pc, 2)}
    `,
  });

  drawScatterChart({
    containerId: "q2ProducedTertiary",
    data: filtered,
    xKey: "produced_capital_share",
    yKey: "tertiary_enrolment_rate",
    sizeKey: "population_total",
    xLabel: "Produced capital share",
    yLabel: "Tertiary enrolment rate",
    statLabel: producedStats,
    percentX: true,
    highlightedNames: producedStandouts,
    labelKey: "country_display",
    tooltipHtml: (row) => `
      <strong>${escapeHtml(row.country_display)}</strong><br>
      Year: ${row.year}<br>
      Produced capital share: ${formatPercent(row.produced_capital_share, 1)}<br>
      Tertiary enrolment: ${formatNumber(row.tertiary_enrolment_rate, 2)}<br>
      Log wealth per capita: ${formatNumber(row.log_wealth_pc, 2)}
    `,
  });

  setExplain(
    "q2HumanSchoolExplain",
    buildHypothesisExplanation({
      stats: humanStats,
      expectedDirection: "positive",
      insufficient:
        "This graph is meant to test whether countries with more human-capital-heavy wealth structures also tend to have better school outcomes, but the current filter leaves too few usable observations to assess that reliably.",
      weak:
        "This graph checks whether countries with a larger human-capital share also sit higher on school life expectancy. In the current slice the pattern is weak, so this view only gives limited support to that idea.",
      support:
        "This graph checks whether countries with a larger human-capital share also sit higher on school life expectancy. In the current view they generally do, which is consistent with stronger school outcomes in more human-capital-heavy wealth structures.",
      contradict:
        "This graph still tests the first claim in this research question, but the current filtered relationship turns negative. That means this slice does not support the expectation that a larger human-capital share aligns with stronger school outcomes."
    })
  );

  setExplain(
    "q2NaturalSchoolExplain",
    buildHypothesisExplanation({
      stats: naturalStats,
      expectedDirection: "negative",
      insufficient:
        "This chart is designed to test whether natural-capital dependence is associated with weaker school outcomes, but the current filter leaves too few usable observations to assess that pattern reliably.",
      weak:
        "This chart checks whether countries with a larger natural-capital share tend to sit lower on school life expectancy. In the current slice that downward pattern is weak, so the evidence here is limited.",
      support:
        "This chart checks whether countries with a larger natural-capital share tend to sit lower on school life expectancy. In the current view the cloud slopes downward, so natural-capital dependence is associated with weaker school outcomes here.",
      contradict:
        "This chart still addresses the natural-capital question, but in the current filtered slice the relationship turns positive. That means this particular selection does not support the expectation that natural-capital dependence aligns with weaker school outcomes."
    })
  );

  setExplain(
    "q2ProducedTertiaryExplain",
    buildHypothesisExplanation({
      stats: producedStats,
      expectedDirection: "positive",
      insufficient:
        "This graph is meant to test whether produced capital is especially relevant for tertiary participation, but the current filter leaves too few usable observations to estimate that relationship reliably.",
      weak:
        "This chart checks whether countries with a larger produced-capital share also sit higher on tertiary enrolment. In the current slice the pattern is weak, so the evidence is only limited.",
      support:
        "This chart checks whether countries with a larger produced-capital share also sit higher on tertiary enrolment. In the current view they generally do, suggesting produced capital is linked more closely to higher education participation than the school-life charts alone would show.",
      contradict:
        "This graph still addresses the produced-capital question, but in the current filtered slice the relationship turns negative. That means this subset does not support the expectation that produced capital aligns with stronger tertiary participation."
    })
  );
}

function renderQ3() {
  const filtered = filterCountryRows(state.datasets.country, state.filters.q3);
  const schoolStats = relationshipStats(filtered, "avg_log_wealth_pc", "avg_school_life_expectancy");
  const tertiaryStats = relationshipStats(filtered, "avg_log_wealth_pc", "avg_tertiary_enrolment_rate");
  const scoredRows = computeQ3Residuals(filtered, schoolStats, tertiaryStats);
  const selectedResidualKey = state.q3Metric === "school" ? "school_residual" : "tertiary_residual";
  const sortedByResidual = scoredRows
    .filter((row) => isFiniteNumber(row[selectedResidualKey]))
    .sort((a, b) => Math.abs(b[selectedResidualKey]) - Math.abs(a[selectedResidualKey]));
  const standoutNames = sortedByResidual.slice(0, 8).map((row) => row.country_display);

  document.getElementById("q3Insight").innerHTML = `
    <strong>Current Relative Performance View</strong>
    <p>
      With the current region and income filters, the school-life average model is ${relationshipSummaryShort(
        schoolStats
      )}, and the tertiary average model is ${relationshipSummaryShort(tertiaryStats)}.
      The highlighted labels show the countries sitting furthest above or below the fitted wealth line for the selected metric.
    </p>
  `;

  setExplain(
    "q3TableIntro",
    buildQ3TableIntro(selectedResidualKey, sortedByResidual.length)
  );

  const q3MetricConfig =
    state.q3Metric === "school"
      ? {
          title: "Overperformers and underperformers in school life expectancy",
          yKey: "avg_school_life_expectancy",
          yLabel: "Average school life expectancy (years)",
          stats: schoolStats,
          tooltipHtml: (row) => `
            <strong>${escapeHtml(row.country_display)}</strong><br>
            Region: ${escapeHtml(row.region)}<br>
            Avg wealth per capita: ${formatCurrency(row.avg_wealth_pc)}<br>
            Avg school life expectancy: ${formatNumber(row.avg_school_life_expectancy, 2)}<br>
            School residual: ${formatSignedDecimal(row.school_residual, 2)}<br>
            Avg human capital share: ${formatPercent(row.avg_human_capital_share, 1)}<br>
            Avg natural capital share: ${formatPercent(row.avg_natural_capital_share, 1)}<br>
            Avg produced capital share: ${formatPercent(row.avg_produced_capital_share, 1)}
          `,
          explanation: buildQ3Explanation("school life expectancy", schoolStats),
        }
      : {
          title: "Overperformers and underperformers in tertiary enrolment rate",
          yKey: "avg_tertiary_enrolment_rate",
          yLabel: "Average tertiary enrolment rate",
          stats: tertiaryStats,
          tooltipHtml: (row) => `
            <strong>${escapeHtml(row.country_display)}</strong><br>
            Region: ${escapeHtml(row.region)}<br>
            Avg wealth per capita: ${formatCurrency(row.avg_wealth_pc)}<br>
            Avg tertiary enrolment: ${formatNumber(row.avg_tertiary_enrolment_rate, 2)}<br>
            Tertiary residual: ${formatSignedDecimal(row.tertiary_residual, 2)}<br>
            Observed years: ${formatInteger(row.n_years_total)}
          `,
          explanation: buildQ3Explanation("tertiary enrolment rate", tertiaryStats),
        };

  document.getElementById("q3MetricTitle").textContent = q3MetricConfig.title;
  drawScatterChart({
    containerId: "q3MetricScatter",
    data: scoredRows,
    xKey: "avg_log_wealth_pc",
    yKey: q3MetricConfig.yKey,
    xLabel: "Average log wealth per capita",
    yLabel: q3MetricConfig.yLabel,
    statLabel: q3MetricConfig.stats,
    highlightedNames: standoutNames,
    labelKey: "country_display",
    tooltipHtml: q3MetricConfig.tooltipHtml,
  });
  setExplain("q3MetricExplain", q3MetricConfig.explanation);

  renderQ3Table(scoredRows);
}

function renderQ4() {
  const spendFiltered = filterCountryYearRows(state.datasets.spend, state.filters.q4);
  const giniFiltered = filterCountryYearRows(state.datasets.gini, state.filters.q4);

  const spendSchoolStats = relationshipStats(
    spendFiltered,
    "education_expenditure_pct_gdp",
    "school_life_expectancy"
  );
  const spendTertiaryStats = relationshipStats(
    spendFiltered,
    "education_expenditure_pct_gdp",
    "tertiary_enrolment_rate"
  );
  const giniSchoolStats = relationshipStats(giniFiltered, "gini_index", "school_life_expectancy");
  const giniTertiaryStats = relationshipStats(giniFiltered, "gini_index", "tertiary_enrolment_rate");
  const spendSchoolStandouts = computeScatterStandouts(
    spendFiltered,
    "education_expenditure_pct_gdp",
    "school_life_expectancy",
    spendSchoolStats
  );
  const spendTertiaryStandouts = computeScatterStandouts(
    spendFiltered,
    "education_expenditure_pct_gdp",
    "tertiary_enrolment_rate",
    spendTertiaryStats
  );
  const giniSchoolStandouts = computeScatterStandouts(
    giniFiltered,
    "gini_index",
    "school_life_expectancy",
    giniSchoolStats
  );
  const giniTertiaryStandouts = computeScatterStandouts(
    giniFiltered,
    "gini_index",
    "tertiary_enrolment_rate",
    giniTertiaryStats
  );
  const spendSchoolPartial = partialCorrelationStats(
    spendFiltered,
    "education_expenditure_pct_gdp",
    "school_life_expectancy",
    "log_wealth_pc"
  );
  const spendTertiaryPartial = partialCorrelationStats(
    spendFiltered,
    "education_expenditure_pct_gdp",
    "tertiary_enrolment_rate",
    "log_wealth_pc"
  );
  const giniSchoolPartial = partialCorrelationStats(
    giniFiltered,
    "gini_index",
    "school_life_expectancy",
    "log_wealth_pc"
  );
  const giniTertiaryPartial = partialCorrelationStats(
    giniFiltered,
    "gini_index",
    "tertiary_enrolment_rate",
    "log_wealth_pc"
  );

  document.getElementById("q4Insight").innerHTML = `
    <strong>Current Policy Subset View</strong>
    <p>
      These policy charts are built on matched country-year subsets only: the spending charts currently use
      up to ${formatInteger(Math.max(spendSchoolStats.n, spendTertiaryStats.n))} usable rows and the Gini charts use up to ${formatInteger(
        Math.max(giniSchoolStats.n, giniTertiaryStats.n)
      )} usable rows across the current filtered view. In this filtered view, spending is ${directionWord(
        spendSchoolStats.r
      )} for school life and ${directionWord(spendTertiaryStats.r)} for tertiary enrolment,
      while inequality is ${directionWord(giniSchoolStats.r)} for school life and ${directionWord(
        giniTertiaryStats.r
      )} for tertiary enrolment. Because the research question says “among countries with similar wealth levels,” these bivariate charts are best read as screening visuals: once wealth is approximately held constant in the filtered data, the spending links become ${relationshipWord(
        spendSchoolPartial.r
      )} (${formatSignedDecimal(spendSchoolPartial.r, 2)} to ${formatSignedDecimal(
        spendTertiaryPartial.r,
        2
      )}) and the inequality links remain more visible, especially for tertiary enrolment (${formatSignedDecimal(
        giniTertiaryPartial.r,
        2
      )}).
    </p>
  `;
  document.getElementById("q4Insight").innerHTML = document
    .getElementById("q4Insight")
    .innerHTML.replace(
      "Because the research question says â€œamong countries with similar wealth levels,â€",
      "Because this research question asks what happens among countries with similar wealth levels,"
    );

  document.getElementById("q4Insight").innerHTML = document
    .getElementById("q4Insight")
    .innerHTML.replace(/Because the research question says[^,]+,\s*/i, "Because this research question asks what happens among countries with similar wealth levels, ")
    .replace("In this filtered view", "In this filtered slice");

  const spendConfig =
    state.q4SpendMetric === "school"
      ? {
          title: "Education spending and school life expectancy",
          yKey: "school_life_expectancy",
          yLabel: "School life expectancy (years)",
          stats: spendSchoolStats,
          highlights: spendSchoolStandouts,
          tooltipHtml: (row) => `
            <strong>${escapeHtml(row.country_display)}</strong><br>
            Year: ${row.year}<br>
            Education expenditure: ${formatNumber(row.education_expenditure_pct_gdp, 2)}% GDP<br>
            School life expectancy: ${formatNumber(row.school_life_expectancy, 2)}<br>
            Wealth per capita: ${formatCurrency(row.wealth_pc)}
          `,
        }
      : {
          title: "Education spending and tertiary enrolment rate",
          yKey: "tertiary_enrolment_rate",
          yLabel: "Tertiary enrolment rate",
          stats: spendTertiaryStats,
          highlights: spendTertiaryStandouts,
          tooltipHtml: (row) => `
            <strong>${escapeHtml(row.country_display)}</strong><br>
            Year: ${row.year}<br>
            Education expenditure: ${formatNumber(row.education_expenditure_pct_gdp, 2)}% GDP<br>
            Tertiary enrolment: ${formatNumber(row.tertiary_enrolment_rate, 2)}<br>
            Wealth per capita: ${formatCurrency(row.wealth_pc)}
          `,
        };
  document.getElementById("q4SpendTitle").textContent = spendConfig.title;
  drawScatterChart({
    containerId: "q4SpendMain",
    data: spendFiltered,
    xKey: "education_expenditure_pct_gdp",
    yKey: spendConfig.yKey,
    sizeKey: "wealth_pc",
    xLabel: "Education expenditure (% GDP)",
    yLabel: spendConfig.yLabel,
    statLabel: spendConfig.stats,
    highlightedNames: spendConfig.highlights,
    labelKey: "country_display",
    tooltipHtml: spendConfig.tooltipHtml,
  });

  const giniConfig =
    state.q4GiniMetric === "school"
      ? {
          title: "Inequality and school life expectancy",
          yKey: "school_life_expectancy",
          yLabel: "School life expectancy (years)",
          stats: giniSchoolStats,
          highlights: giniSchoolStandouts,
          tooltipHtml: (row) => `
            <strong>${escapeHtml(row.country_display)}</strong><br>
            Year: ${row.year}<br>
            Gini index: ${formatNumber(row.gini_index, 2)}<br>
            School life expectancy: ${formatNumber(row.school_life_expectancy, 2)}<br>
            Wealth per capita: ${formatCurrency(row.wealth_pc)}
          `,
        }
      : {
          title: "Inequality and tertiary enrolment rate",
          yKey: "tertiary_enrolment_rate",
          yLabel: "Tertiary enrolment rate",
          stats: giniTertiaryStats,
          highlights: giniTertiaryStandouts,
          tooltipHtml: (row) => `
            <strong>${escapeHtml(row.country_display)}</strong><br>
            Year: ${row.year}<br>
            Gini index: ${formatNumber(row.gini_index, 2)}<br>
            Tertiary enrolment: ${formatNumber(row.tertiary_enrolment_rate, 2)}<br>
            Wealth per capita: ${formatCurrency(row.wealth_pc)}
          `,
        };
  document.getElementById("q4GiniTitle").textContent = giniConfig.title;
  drawScatterChart({
    containerId: "q4GiniMain",
    data: giniFiltered,
    xKey: "gini_index",
    yKey: giniConfig.yKey,
    sizeKey: "wealth_pc",
    xLabel: "Gini index",
    yLabel: giniConfig.yLabel,
    statLabel: giniConfig.stats,
    highlightedNames: giniConfig.highlights,
    labelKey: "country_display",
    tooltipHtml: giniConfig.tooltipHtml,
  });

  setExplain(
    "q4SpendExplain",
    state.q4SpendMetric === "school"
      ? buildHypothesisExplanation({
          stats: spendSchoolStats,
          expectedDirection: "positive",
          insufficient:
            "This graph is meant to test whether countries that spend a larger share of GDP on education also tend to have higher school life expectancy, but the current policy subset leaves too few usable observations to assess that reliably.",
          weak:
            "This graph compares education spending with school life expectancy in the matched policy subset. In the current filtered slice the points show only a weak upward pattern, so the evidence is limited.",
          support:
            "This graph compares education spending with school life expectancy in the matched policy subset. In the current view the points slope upward, so higher spending is associated with stronger school outcomes, but this is still a raw relationship rather than a strict within-wealth comparison.",
          contradict:
            "This graph still addresses the spending part of this research question, but in the current filtered subset the relationship turns negative. That means this selection does not support the expectation that higher education spending aligns with stronger school outcomes."
        })
      : buildHypothesisExplanation({
          stats: spendTertiaryStats,
          expectedDirection: "positive",
          insufficient:
            "This chart is meant to test the same spending logic for tertiary enrolment, but the current policy subset leaves too few usable observations to assess that relationship reliably.",
          weak:
            "This chart compares education spending with tertiary enrolment in the matched policy subset. In the current slice the points are fairly dispersed, so only limited evidence appears in this raw view.",
          support:
            "This chart compares education spending with tertiary enrolment in the matched policy subset. In the current view the cloud slopes upward, so higher spending is associated with higher participation, but the chart should still be read as supportive rather than definitive evidence.",
          contradict:
            "This chart still addresses the spending side of this research question, but in the current filtered subset the relationship turns negative. That means this slice does not support the expectation that higher education spending aligns with stronger tertiary participation."
        })
  );

  setExplain(
    "q4GiniExplain",
    state.q4GiniMetric === "school"
      ? buildHypothesisExplanation({
          stats: giniSchoolStats,
          expectedDirection: "negative",
          insufficient:
            "This graph is meant to test whether higher inequality is associated with weaker school outcomes, but the current Gini subset leaves too few usable observations to assess that reliably.",
          weak:
            "This chart compares inequality with school life expectancy in the matched subset. In the current slice the downward pattern is weak, so the evidence here is limited.",
          support:
            "This chart compares inequality with school life expectancy in the matched subset. In the current view the points trend downward, so higher inequality is associated with weaker school outcomes here, although the subset is still smaller than the main wealth and composition views.",
          contradict:
            "This graph still addresses the inequality part of this research question, but in the current filtered subset the relationship turns positive. That means this slice does not support the expectation that higher inequality aligns with weaker school outcomes."
        })
      : buildHypothesisExplanation({
          stats: giniTertiaryStats,
          expectedDirection: "negative",
          insufficient:
            "This chart is meant to test whether greater inequality coincides with weaker tertiary participation, but the current Gini subset leaves too few usable observations to assess that reliably.",
          weak:
            "This chart compares inequality with tertiary enrolment in the matched subset. In the current slice the downward pattern is weak, so only limited evidence appears here.",
          support:
            "This chart compares inequality with tertiary enrolment in the matched subset. In the current view the points slope downward, so greater inequality is associated with weaker tertiary participation, and this is the clearest of the four policy relationships.",
          contradict:
            "This chart still addresses the inequality question for higher education, but in the current filtered subset the relationship turns positive. That means this slice does not support the expectation that greater inequality coincides with weaker tertiary participation."
        })
  );
}

function buildHypothesisExplanation({ stats, expectedDirection, insufficient, weak, support, contradict }) {
  const assessment = assessRelationship(stats, expectedDirection);
  const metricText = relationshipMetricText(stats);

  if (assessment.status === "insufficient") {
    return `${insufficient} <strong>${metricText}</strong>.`;
  }

  if (assessment.status === "weak") {
    return `${weak} <strong>${metricText}</strong>.`;
  }

  if (assessment.status === "contradicts") {
    return `${contradict} <strong>${metricText}</strong>.`;
  }

  return `${support} <strong>${metricText}</strong>.`;
}

function buildQ3Explanation(metricLabel, stats) {
  const assessment = assessRelationship(stats, "positive");
  const metricText = relationshipMetricText(stats);

  if (assessment.status === "insufficient") {
    return `This chart is meant to identify overperformers and underperformers in ${metricLabel}, but the current filters leave too few country averages to estimate a reliable fitted trend. <strong>${metricText}</strong>.`;
  }

  if (assessment.status === "weak") {
    return `This chart still helps with the relative-performance question because residuals are defined relative to the fitted line, but in the current filtered sample the overall wealth-to-${metricLabel} relationship is weak. That means standout countries should be interpreted cautiously because the baseline trend itself is not strong. <strong>${metricText}</strong>.`;
  }

  return `This chart addresses the relative-performance question by showing the fitted wealth-to-${metricLabel} relationship and then highlighting countries that sit noticeably above or below that line. Positive residuals mean a country performs above the fitted expectation for its wealth level, while negative residuals mean it underperforms relative to that same benchmark. <strong>${metricText}</strong>.`;
}

function buildQ3TableIntro(residualKey, standoutCount) {
  const metricLabel = residualKey === "school_residual" ? "school life expectancy" : "tertiary enrolment rate";
  if (!standoutCount) {
    return `This table ranks countries by the size of their residual from the current fitted line for <strong>${metricLabel}</strong>. Positive residuals mean the country sits above the fitted wealth trend, while negative residuals mean it sits below it.`;
  }

  return `This table ranks countries by how far they sit above or below the current fitted line for <strong>${metricLabel}</strong>. Positive residuals mean the country performs above the wealth-predicted benchmark for the selected metric, while negative residuals mean it performs below that benchmark.`;
}

function assessRelationship(stats, expectedDirection = null) {
  if (!stats || stats.n < 3 || !isFiniteNumber(stats.r)) {
    return { status: "insufficient", direction: "unclear", strength: "unclear" };
  }

  const direction = directionWord(stats.r);
  const strength = relationshipWord(stats.r);
  const abs = Math.abs(Number(stats.r));

  if (abs < 0.2) {
    return { status: "weak", direction, strength };
  }

  if (expectedDirection && direction !== expectedDirection) {
    return { status: "contradicts", direction, strength };
  }

  return { status: "supports", direction, strength };
}

function relationshipMetricText(stats) {
  if (!stats) {
    return "r = N/A, n = 0";
  }

  return `r = ${formatSignedDecimal(stats.r, 2)}, n = ${formatInteger(stats.n)}`;
}

function relationshipStrokeColor(r) {
  if (!isFiniteNumber(r)) return SEMANTIC_COLORS.neutral;
  const abs = Math.abs(Number(r));
  if (abs < 0.2) return SEMANTIC_COLORS.neutral;
  return Number(r) >= 0 ? SEMANTIC_COLORS.positive : SEMANTIC_COLORS.negative;
}

function trendStrokeColor(delta, preferredPositive = SEMANTIC_COLORS.positive) {
  if (!isFiniteNumber(delta)) return SEMANTIC_COLORS.neutral;
  if (Math.abs(Number(delta)) < 0.0001) return SEMANTIC_COLORS.neutral;
  return Number(delta) >= 0 ? preferredPositive : SEMANTIC_COLORS.negative;
}

function yearlyRelationshipSummary(rows, xKey, yKey) {
  const grouped = d3.groups(rows, (row) => row.year)
    .map(([year, yearRows]) => ({
      year: Number(year),
      ...relationshipStats(yearRows, xKey, yKey),
    }))
    .filter((row) => isFiniteNumber(row.r))
    .sort((a, b) => a.year - b.year);

  if (!grouped.length) {
    return { minR: null, maxR: null, startR: null, endR: null, startYear: null, endYear: null };
  }

  return {
    minR: d3.min(grouped, (row) => row.r),
    maxR: d3.max(grouped, (row) => row.r),
    startR: grouped[0].r,
    endR: grouped[grouped.length - 1].r,
    startYear: grouped[0].year,
    endYear: grouped[grouped.length - 1].year,
  };
}

function partialCorrelationStats(rows, xKey, yKey, controlKey) {
  const clean = rows
    .map((row) => ({
      x: Number(row[xKey]),
      y: Number(row[yKey]),
      c: Number(row[controlKey]),
    }))
    .filter((row) => Number.isFinite(row.x) && Number.isFinite(row.y) && Number.isFinite(row.c));

  if (clean.length < 5) {
    return { n: clean.length, r: null };
  }

  const fitOnControl = (depKey) => {
    const cMean = d3.mean(clean, (row) => row.c);
    const depMean = d3.mean(clean, (row) => row[depKey]);
    let numerator = 0;
    let denominator = 0;

    clean.forEach((row) => {
      numerator += (row.c - cMean) * (row[depKey] - depMean);
      denominator += (row.c - cMean) ** 2;
    });

    if (!denominator) {
      return { intercept: null, slope: null };
    }

    const slope = numerator / denominator;
    const intercept = depMean - slope * cMean;
    return { intercept, slope };
  };

  const xFit = fitOnControl("x");
  const yFit = fitOnControl("y");
  if (!isFiniteNumber(xFit.slope) || !isFiniteNumber(yFit.slope)) {
    return { n: clean.length, r: null };
  }

  const residualRows = clean.map((row) => ({
    xr: row.x - (xFit.intercept + xFit.slope * row.c),
    yr: row.y - (yFit.intercept + yFit.slope * row.c),
  }));

  const residualStats = relationshipStats(
    residualRows.map((row) => ({ x_residual: row.xr, y_residual: row.yr })),
    "x_residual",
    "y_residual"
  );

  return { n: residualStats.n, r: residualStats.r };
}

function relationshipSummaryShort(stats) {
  const assessment = assessRelationship(stats);
  if (assessment.status === "insufficient") {
    return `insufficient for a reliable estimate (${relationshipMetricText(stats)})`;
  }

  return `${assessment.strength} and ${assessment.direction} (${relationshipMetricText(stats)})`;
}

function drawScatterChart(config) {
  const rows = config.data.filter(
    (row) => isFiniteNumber(row[config.xKey]) && isFiniteNumber(row[config.yKey])
  );
  if (!rows.length) {
    renderEmpty(config.containerId, "No observations match this chart after filtering.");
    return;
  }

  const base = createSvg(config.containerId);
  const { svg, plot, innerWidth, innerHeight, margin } = base;
  const xValues = rows.map((row) => +row[config.xKey]);
  const yValues = rows.map((row) => +row[config.yKey]);
  const x = d3.scaleLinear().domain(paddedExtent(xValues)).range([0, innerWidth]).nice();
  const y = d3.scaleLinear().domain(paddedExtent(yValues)).range([innerHeight, 0]).nice();

  const r = config.sizeKey
    ? d3
        .scaleSqrt()
        .domain(d3.extent(rows, (row) => +row[config.sizeKey]))
        .range([4, 24])
    : () => 6.5;

  drawGrid(plot, innerWidth, innerHeight, x, y);

  const regression = config.statLabel || relationshipStats(rows, config.xKey, config.yKey);
  let regressionPath = null;
  const regressionColor = relationshipStrokeColor(regression.r);
  if (isFiniteNumber(regression.slope)) {
    const clippedRegression = getClippedRegressionSegment(
      x.domain(),
      y.domain(),
      regression.slope,
      regression.intercept
    );
    if (clippedRegression) {
      regressionPath = plot
        .append("path")
        .datum(clippedRegression)
        .attr("class", "regression-line")
        .attr("stroke", regressionColor)
        .attr(
          "d",
          d3
            .line()
            .x((d) => x(d.x))
            .y((d) => y(d.y))
        );
    }
  }

  const sortedRows = [...rows].sort(
    (a, b) => (config.sizeKey ? +b[config.sizeKey] || 0 : 0) - (config.sizeKey ? +a[config.sizeKey] || 0 : 0)
  );

  const circles = plot
    .append("g")
    .selectAll("circle")
    .data(sortedRows)
    .join("circle")
    .attr("cx", (row) => x(+row[config.xKey]))
    .attr("cy", (row) => y(+row[config.yKey]) + 10)
    .attr("r", (row) => (config.sizeKey ? r(+row[config.sizeKey]) : r()))
    .attr("fill", (row) => REGION_COLORS[row.region] || "#64748b")
    .attr("fill-opacity", 0)
    .attr("stroke", getComputedStyle(document.documentElement).getPropertyValue("--surface-strong").trim() || "#ffffff")
    .attr("stroke-width", 1.1)
    .style("cursor", "pointer")
    .on("mouseenter", (event, row) => showTooltip(config.tooltipHtml(row), event))
    .on("mousemove", (event, row) => showTooltip(config.tooltipHtml(row), event))
    .on("mouseleave", hideTooltip)
    .on("mouseenter.bubble", function (_, row) {
      d3.select(this)
        .raise()
        .transition()
        .duration(120)
        .attr("r", (config.sizeKey ? r(+row[config.sizeKey]) : r()) * 1.18);
    })
    .on("mouseleave.bubble", function (_, row) {
      d3.select(this)
        .transition()
        .duration(160)
        .attr("r", config.sizeKey ? r(+row[config.sizeKey]) : r());
    });

  let labelHalo = null;
  let labelText = null;
  if (Array.isArray(config.highlightedNames) && config.highlightedNames.length && config.labelKey) {
    const highlighted = rows.filter((row) => config.highlightedNames.includes(row[config.labelKey]));
    const labelGroup = plot.append("g");
    labelHalo = labelGroup
      .selectAll("text.label-halo")
      .data(highlighted)
      .join("text")
      .attr("class", "label-halo annotation-text")
      .attr("x", (row) => x(+row[config.xKey]) + 8)
      .attr("y", (row) => y(+row[config.yKey]) - 8)
      .style("opacity", 0)
      .text((row) => row[config.labelKey]);

    labelText = labelGroup
      .selectAll("text.annotation-text")
      .data(highlighted)
      .join("text")
      .attr("class", "annotation-text")
      .attr("x", (row) => x(+row[config.xKey]) + 8)
      .attr("y", (row) => y(+row[config.yKey]) - 8)
      .style("opacity", 0)
      .text((row) => row[config.labelKey]);
  }

  const xAxis = d3.axisBottom(x).ticks(6);
  const yAxis = d3.axisLeft(y).ticks(6);
  if (config.percentX) xAxis.tickFormat(d3.format(".0%"));

  plot
    .append("g")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(xAxis);

  plot.append("g").call(yAxis);

  svg
    .append("text")
    .attr("class", "axis-label")
    .attr("x", margin.left + innerWidth / 2)
    .attr("y", margin.top + innerHeight + 48)
    .attr("text-anchor", "middle")
    .text(config.xLabel);

  svg
    .append("text")
    .attr("class", "axis-label")
    .attr("transform", `translate(18,${margin.top + innerHeight / 2}) rotate(-90)`)
    .attr("text-anchor", "middle")
    .text(config.yLabel);

  svg
    .append("text")
    .attr("class", "annotation-text")
    .attr("x", margin.left)
    .attr("y", margin.top - 14)
    .attr("fill", regressionColor)
    .text(`n = ${formatInteger(regression.n)} | r = ${formatSignedDecimal(regression.r, 2)}`);

  registerChartAnimation(config.containerId, () => {
    if (regressionPath) {
      animatePath(regressionPath, 1100, 120);
    }

    circles
      .transition()
      .delay((_, index) => Math.min(index * 7, 560))
      .duration(500)
      .ease(d3.easeCubicOut)
      .attr("cy", (row) => y(+row[config.yKey]))
      .attr("fill-opacity", 0.76);

    if (labelHalo) {
      labelHalo.transition().delay(420).duration(300).style("opacity", 1);
    }
    if (labelText) {
      labelText.transition().delay(420).duration(300).style("opacity", 1);
    }
  });
}

function drawLineChart(config) {
  const series = config.series
    .map((item) => ({
      ...item,
      values: item.values.filter((point) => isFiniteNumber(point.x) && isFiniteNumber(point.y)),
    }))
    .filter((item) => item.values.length);

  if (!series.length) {
    renderEmpty(config.containerId, "No observations are available for this line chart.");
    return;
  }

  const allPoints = series.flatMap((item) => item.values);
  const base = createSvg(config.containerId);
  const { svg, plot, innerWidth, innerHeight, margin } = base;
  const x = d3
    .scaleLinear()
    .domain(d3.extent(allPoints, (point) => point.x))
    .range([0, innerWidth]);
  const y = d3
    .scaleLinear()
    .domain(paddedExtent(allPoints.map((point) => point.y)))
    .range([innerHeight, 0])
    .nice();

  drawGrid(plot, innerWidth, innerHeight, x, y);

  const line = d3
    .line()
    .x((point) => x(point.x))
    .y((point) => y(point.y));

  const clipId = `clip-${config.containerId}`;
  const revealRect = svg
    .append("defs")
    .append("clipPath")
    .attr("id", clipId)
    .append("rect")
    .attr("x", -4)
    .attr("y", -8)
    .attr("width", 0)
    .attr("height", innerHeight + 16);

  const revealLayer = plot
    .append("g")
    .attr("clip-path", `url(#${clipId})`);

  const groups = revealLayer
    .append("g")
    .selectAll("g.series")
    .data(series)
    .join("g");

  const paths = groups
    .append("path")
    .attr("class", "line-series")
    .attr("stroke", (item) => item.color)
    .attr("d", (item) => line(item.values));

  const points = groups
    .selectAll("circle")
    .data((item) => item.values.map((point) => ({ ...point, color: item.color, name: item.name })))
    .join("circle")
    .attr("class", "line-point")
    .attr("cx", (point) => x(point.x))
    .attr("cy", (point) => y(point.y))
    .attr("r", 0)
    .attr("fill", (point) => point.color)
    .style("opacity", 0)
    .on(
      "mouseenter",
      (event, point) =>
        showTooltip(
          `<strong>${escapeHtml(point.name)}</strong><br>Year: ${point.x}<br>Value: ${formatNumber(point.y, 2)}`,
          event
        )
    )
    .on(
      "mousemove",
      (event, point) =>
        showTooltip(
          `<strong>${escapeHtml(point.name)}</strong><br>Year: ${point.x}<br>Value: ${formatNumber(point.y, 2)}`,
          event
        )
    )
    .on("mouseleave", hideTooltip);

  let endLabels = null;
  if (config.labelLineEnds && series.length <= 8) {
    endLabels = plot
      .append("g")
      .selectAll("text")
      .data(series)
      .join("text")
      .attr("class", "annotation-text")
      .attr("x", (item) => x(item.values[item.values.length - 1].x) + 8)
      .attr("y", (item) => y(item.values[item.values.length - 1].y))
      .attr("dy", "0.32em")
      .style("fill", (item) => item.color)
      .style("opacity", 0)
      .text((item) => item.name);
  }

  plot
    .append("g")
    .attr("transform", `translate(0,${innerHeight})`)
    .call(d3.axisBottom(x).tickFormat(d3.format("d")).ticks(Math.min(8, allPoints.length)));

  plot.append("g").call(d3.axisLeft(y).ticks(6));

  svg
    .append("text")
    .attr("class", "axis-label")
    .attr("x", margin.left + innerWidth / 2)
    .attr("y", margin.top + innerHeight + 48)
    .attr("text-anchor", "middle")
    .text(config.xLabel);

  svg
    .append("text")
    .attr("class", "axis-label")
    .attr("transform", `translate(18,${margin.top + innerHeight / 2}) rotate(-90)`)
    .attr("text-anchor", "middle")
    .text(config.yLabel);

  registerChartAnimation(config.containerId, () => {
    const revealDuration = 1600;
    const revealDelay = 120;

    revealRect
      .transition()
      .delay(revealDelay)
      .duration(revealDuration)
      .ease(d3.easeCubicInOut)
      .attr("width", innerWidth + 12);

    points
      .transition()
      .delay((point) => revealDelay + (x(point.x) / Math.max(innerWidth, 1)) * revealDuration)
      .duration(240)
      .ease(d3.easeCubicOut)
      .attr("r", 4.5)
      .style("opacity", 1);

    if (endLabels) {
      endLabels.transition().delay(revealDelay + revealDuration - 120).duration(300).style("opacity", 1);
    }
  });
}

function renderQ3Table(rows) {
  const residualKey = state.q3Metric === "school" ? "school_residual" : "tertiary_residual";
  const sorted = rows
    .filter((row) => isFiniteNumber(row[residualKey]))
    .sort((a, b) => Number(b[residualKey]) - Number(a[residualKey]));

  const overperformers = sorted.slice(0, 6).map((row) => ({ ...row, status: "Overperformer" }));
  const underperformers = [...sorted]
    .sort((a, b) => Number(a[residualKey]) - Number(b[residualKey]))
    .slice(0, 6)
    .map((row) => ({ ...row, status: "Underperformer" }));
  const tableRows = [...overperformers, ...underperformers];

  if (!tableRows.length) {
    renderEmptyTable(
      "q3StandoutsTable",
      rows.length
        ? "The current filters leave too few country averages to estimate a reliable trend line. Widen the filters to compute standout residuals."
        : "No country averages match the current filters."
    );
    return;
  }

  document.getElementById("q3StandoutsTable").innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Status</th>
          <th>Country</th>
          <th>Region</th>
          <th>Avg Log Wealth</th>
          <th>Avg School Life</th>
          <th>Avg Tertiary</th>
          <th>Avg Human Share</th>
          <th>Avg Natural Share</th>
          <th>Avg Produced Share</th>
          <th>Residual</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows
          .map(
            (row) => `
              <tr>
                <td>
                  <span class="status-pill ${row.status === "Overperformer" ? "status-over" : "status-under"}">
                    ${row.status}
                  </span>
                </td>
                <td>${escapeHtml(row.country_display)}</td>
                <td>${escapeHtml(row.region)}</td>
                <td>${formatNumber(row.avg_log_wealth_pc, 2)}</td>
                <td>${formatNumber(row.avg_school_life_expectancy, 2)}</td>
                <td>${formatNumber(row.avg_tertiary_enrolment_rate, 2)}</td>
                <td>${formatPercent(row.avg_human_capital_share, 1)}</td>
                <td>${formatPercent(row.avg_natural_capital_share, 1)}</td>
                <td>${formatPercent(row.avg_produced_capital_share, 1)}</td>
                <td>${formatSignedDecimal(row[residualKey], 2)}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function computeQ3Residuals(rows, schoolStats, tertiaryStats) {
  return rows.map((row) => {
    const schoolResidual =
      isFiniteNumber(row.avg_log_wealth_pc) &&
      isFiniteNumber(row.avg_school_life_expectancy) &&
      isFiniteNumber(schoolStats.slope) &&
      isFiniteNumber(schoolStats.intercept)
        ? Number(row.avg_school_life_expectancy) -
          (Number(row.avg_log_wealth_pc) * Number(schoolStats.slope) + Number(schoolStats.intercept))
        : null;

    const tertiaryResidual =
      isFiniteNumber(row.avg_log_wealth_pc) &&
      isFiniteNumber(row.avg_tertiary_enrolment_rate) &&
      isFiniteNumber(tertiaryStats.slope) &&
      isFiniteNumber(tertiaryStats.intercept)
        ? Number(row.avg_tertiary_enrolment_rate) -
          (Number(row.avg_log_wealth_pc) * Number(tertiaryStats.slope) + Number(tertiaryStats.intercept))
        : null;

    return {
      ...row,
      school_residual: schoolResidual,
      tertiary_residual: tertiaryResidual,
    };
  });
}

function computeScatterStandouts(rows, xKey, yKey, stats, perDirection = 2) {
  if (!isFiniteNumber(stats?.slope) || !isFiniteNumber(stats?.intercept)) {
    return [];
  }

  const residualRows = rows
    .filter((row) => isFiniteNumber(row[xKey]) && isFiniteNumber(row[yKey]) && row.country_display)
    .map((row) => ({
      row,
      residual: Number(row[yKey]) - (Number(row[xKey]) * Number(stats.slope) + Number(stats.intercept)),
    }));

  if (!residualRows.length) {
    return [];
  }

  const above = [...residualRows]
    .sort((a, b) => d3.descending(a.residual, b.residual))
    .slice(0, perDirection);
  const below = [...residualRows]
    .sort((a, b) => d3.ascending(a.residual, b.residual))
    .slice(0, perDirection);

  return [...new Set([...above, ...below].map((item) => item.row.country_display))];
}

function buildRegionalSeries(metricKey) {
  const grouped = d3.groups(state.datasets.yearRegionSummary, (row) => row.region);
  return grouped
    .map(([region, rows]) => ({
      name: region,
      color: REGION_COLORS[region] || "#64748b",
      values: rows
        .filter((row) => isFiniteNumber(row[metricKey]))
        .sort((a, b) => a.year - b.year)
        .map((row) => ({ x: row.year, y: row[metricKey] })),
    }))
    .filter((item) => item.values.length);
}

function filterCountryYearRows(rows, filters) {
  return rows.filter((row) => {
    if (filters.year != null && row.year !== filters.year) return false;
    if (filters.region !== "all" && row.region !== filters.region) return false;
    if (filters.income !== "all" && row.income_group !== filters.income) return false;
    return true;
  });
}

function filterCountryRows(rows, filters) {
  return rows.filter((row) => {
    if (filters.region !== "all" && row.region !== filters.region) return false;
    if (filters.income !== "all" && row.income_group !== filters.income) return false;
    return true;
  });
}

function relationshipStats(rows, xKey, yKey) {
  const pairs = rows
    .map((row) => ({ x: Number(row[xKey]), y: Number(row[yKey]) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

  if (pairs.length < 3) {
    return { n: pairs.length, r: null, slope: null, intercept: null, r2: null };
  }

  const xMean = d3.mean(pairs, (point) => point.x);
  const yMean = d3.mean(pairs, (point) => point.y);
  let numerator = 0;
  let xVariance = 0;
  let yVariance = 0;

  pairs.forEach((point) => {
    const dx = point.x - xMean;
    const dy = point.y - yMean;
    numerator += dx * dy;
    xVariance += dx * dx;
    yVariance += dy * dy;
  });

  if (!xVariance || !yVariance) {
    return { n: pairs.length, r: null, slope: null, intercept: null, r2: null };
  }

  const r = numerator / Math.sqrt(xVariance * yVariance);
  const slope = numerator / xVariance;
  const intercept = yMean - slope * xMean;
  return { n: pairs.length, r, slope, intercept, r2: r * r };
}

function createSvg(containerId) {
  const container = d3.select(`#${containerId}`);
  container.html("");

  const width = container.node().clientWidth || 320;
  const height = container.node().clientHeight || 420;
  const margin = { top: 38, right: 30, bottom: 70, left: 72 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const svg = container
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

  const plot = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  return { svg, plot, width, height, margin, innerWidth, innerHeight };
}

function drawGrid(plot, width, height, x, y) {
  plot
    .append("g")
    .attr("class", "grid")
    .attr("transform", `translate(0,${height})`)
    .call(d3.axisBottom(x).ticks(6).tickSize(-height).tickFormat(""));

  plot
    .append("g")
    .attr("class", "grid")
    .call(d3.axisLeft(y).ticks(6).tickSize(-width).tickFormat(""));
}

function registerChartAnimation(containerId, animate) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.dataset.animated = "false";
  chartAnimations.set(containerId, animate);
  chartObserver.observe(container);

  if (isElementInViewport(container, 0.22)) {
    requestAnimationFrame(() => {
      if (container.dataset.animated !== "true") {
        container.dataset.animated = "true";
        animate();
      }
    });
  }
}

function getClippedRegressionSegment(xDomain, yDomain, slope, intercept) {
  if (!isFiniteNumber(slope) || !isFiniteNumber(intercept)) {
    return null;
  }

  const [xMin, xMax] = xDomain[0] <= xDomain[1] ? xDomain : [xDomain[1], xDomain[0]];
  const [yMin, yMax] = yDomain[0] <= yDomain[1] ? yDomain : [yDomain[1], yDomain[0]];
  const epsilon = 1e-9;
  const candidates = [];

  const pushIfVisible = (xValue, yValue) => {
    if (!Number.isFinite(xValue) || !Number.isFinite(yValue)) {
      return;
    }
    if (xValue < xMin - epsilon || xValue > xMax + epsilon) {
      return;
    }
    if (yValue < yMin - epsilon || yValue > yMax + epsilon) {
      return;
    }
    candidates.push({
      x: Math.max(xMin, Math.min(xMax, xValue)),
      y: Math.max(yMin, Math.min(yMax, yValue)),
    });
  };

  pushIfVisible(xMin, intercept + slope * xMin);
  pushIfVisible(xMax, intercept + slope * xMax);

  if (Math.abs(slope) > epsilon) {
    pushIfVisible((yMin - intercept) / slope, yMin);
    pushIfVisible((yMax - intercept) / slope, yMax);
  }

  const unique = candidates.filter(
    (point, index, all) =>
      all.findIndex(
        (candidate) =>
          Math.abs(candidate.x - point.x) < epsilon && Math.abs(candidate.y - point.y) < epsilon
      ) === index
  );

  if (unique.length < 2) {
    return null;
  }

  let bestPair = [unique[0], unique[1]];
  let bestDistance = -Infinity;

  for (let i = 0; i < unique.length - 1; i += 1) {
    for (let j = i + 1; j < unique.length; j += 1) {
      const dx = unique[i].x - unique[j].x;
      const dy = unique[i].y - unique[j].y;
      const distance = dx * dx + dy * dy;
      if (distance > bestDistance) {
        bestDistance = distance;
        bestPair = [unique[i], unique[j]];
      }
    }
  }

  return bestPair.sort((a, b) => a.x - b.x);
}

function togglePaletteWidget() {
  const widget = document.getElementById("paletteWidget");
  const minimized = widget.classList.toggle("is-minimized");
  document.getElementById("paletteWidgetToggle").setAttribute("aria-expanded", minimized ? "false" : "true");
}

function minimizePaletteWidget() {
  const widget = document.getElementById("paletteWidget");
  widget.classList.add("is-minimized");
  document.getElementById("paletteWidgetToggle").setAttribute("aria-expanded", "false");
}

function setupMetricCounters() {
  metricObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting || entry.target.dataset.countAnimated === "true") return;
        entry.target.dataset.countAnimated = "true";
        animateMetric(entry.target);
      });
    },
    { threshold: 0.55 }
  );

  document.querySelectorAll("[data-metric-target]").forEach((node) => metricObserver.observe(node));
}

function animateMetric(node) {
  const target = Number(node.dataset.metricTarget);
  if (!Number.isFinite(target)) return;
  const duration = 1200;
  const start = performance.now();

  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    node.textContent = formatInteger(Math.round(target * eased));
    if (progress < 1) {
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}

function setAnimatedMetric(id, target) {
  const node = document.getElementById(id);
  node.dataset.metricTarget = String(target);
  node.dataset.countAnimated = "false";
  node.textContent = "0";
}

function setupMotionEnhancements() {
  const cards = document.querySelectorAll(".topic-card");
  cards.forEach((card) => card.style.setProperty("--parallax-shift", "0px"));

  const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const syncMotionPreference = () => {
    document.documentElement.classList.toggle("reduced-motion-ui", mediaQuery.matches);
  };

  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", syncMotionPreference);
  } else if (typeof mediaQuery.addListener === "function") {
    mediaQuery.addListener(syncMotionPreference);
  }

  syncMotionPreference();
}

function openReportOverlay() {
  const overlay = document.getElementById("reportOverlay");
  const frame = document.getElementById("reportFrame");
  if (!overlay) return;

  if (frame && !frame.getAttribute("src")) {
    const source = frame.dataset.src;
    if (source) {
      frame.setAttribute("src", source);
    }
  }

  overlay.hidden = false;
  document.body.classList.add("report-open");
}

function closeReportOverlay() {
  const overlay = document.getElementById("reportOverlay");
  const frame = document.getElementById("reportFrame");
  if (!overlay || overlay.hidden) return;

  if (frame) {
    frame.removeAttribute("src");
  }

  overlay.hidden = true;
  document.body.classList.remove("report-open");
}

function animatePath(pathSelection, duration = 1200, delay = 0) {
  const node = pathSelection.node();
  if (!node) return;
  const length = node.getTotalLength();
  pathSelection
    .attr("stroke-dasharray", `${length} ${length}`)
    .attr("stroke-dashoffset", length)
    .transition()
    .delay(delay)
    .duration(duration)
    .ease(d3.easeCubicOut)
    .attr("stroke-dashoffset", 0);
}

function isElementInViewport(element, threshold = 0.2) {
  const rect = element.getBoundingClientRect();
  const viewHeight = window.innerHeight || document.documentElement.clientHeight;
  const visibleTop = Math.max(0, rect.top);
  const visibleBottom = Math.min(viewHeight, rect.bottom);
  const visibleHeight = Math.max(0, visibleBottom - visibleTop);
  return visibleHeight / Math.max(rect.height, 1) >= threshold;
}

function setExplain(id, html) {
  document.getElementById(id).innerHTML = html;
}

function lineChangeStats(rows, valueKey) {
  const clean = rows
    .filter((row) => isFiniteNumber(row[valueKey]) && isFiniteNumber(row.year))
    .sort((a, b) => a.year - b.year);
  if (!clean.length) return { start: null, end: null, delta: null };
  const start = clean[0][valueKey];
  const end = clean[clean.length - 1][valueKey];
  return { start, end, delta: end - start };
}

function regionalLatestSummary(metricKey) {
  const latestYear = d3.max(state.datasets.yearRegionSummary, (row) => row.year);
  const current = state.datasets.yearRegionSummary
    .filter((row) => row.year === latestYear && isFiniteNumber(row[metricKey]))
    .sort((a, b) => d3.descending(a[metricKey], b[metricKey]));

  if (!current.length) {
    return {
      top: { region: "N/A", value: null },
      bottom: { region: "N/A", value: null },
    };
  }

  return {
    top: { region: current[0].region, value: current[0][metricKey] },
    bottom: {
      region: current[current.length - 1].region,
      value: current[current.length - 1][metricKey],
    },
  };
}

function renderEmpty(containerId, message) {
  document.getElementById(containerId).innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function renderEmptyTable(containerId, message) {
  document.getElementById(containerId).innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function paddedExtent(values) {
  const extent = d3.extent(values);
  if (!Number.isFinite(extent[0]) || !Number.isFinite(extent[1])) {
    return [0, 1];
  }

  if (extent[0] === extent[1]) {
    const bump = extent[0] === 0 ? 1 : Math.abs(extent[0]) * 0.08;
    return [extent[0] - bump, extent[1] + bump];
  }

  const padding = (extent[1] - extent[0]) * 0.08;
  return [extent[0] - padding, extent[1] + padding];
}

function showTooltip(html, event) {
  tooltip.html(html).style("transform", `translate(${event.clientX + 16}px, ${event.clientY + 16}px)`);
}

function hideTooltip() {
  tooltip.style("transform", "translate(-9999px, -9999px)");
}

function relationshipWord(r) {
  if (!isFiniteNumber(r)) return "unclear";
  const abs = Math.abs(r);
  if (abs >= 0.7) return "strong";
  if (abs >= 0.45) return "moderate";
  if (abs >= 0.25) return "weak-to-moderate";
  return "weak";
}

function directionWord(r) {
  if (!isFiniteNumber(r)) return "unclear";
  return r >= 0 ? "positive" : "negative";
}

function isFiniteNumber(value) {
  return value !== null && value !== undefined && Number.isFinite(Number(value));
}

function setText(id, value) {
  document.getElementById(id).textContent = value;
}

function formatInteger(value) {
  return Number(value ?? 0).toLocaleString("en-GB", { maximumFractionDigits: 0 });
}

function formatCompactNumber(value) {
  if (!isFiniteNumber(value)) return "N/A";
  return Number(value).toLocaleString("en-GB", {
    notation: "compact",
    maximumFractionDigits: 1,
  });
}

function formatNumber(value, digits = 1) {
  if (!isFiniteNumber(value)) return "N/A";
  return Number(value).toLocaleString("en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatSignedDecimal(value, digits = 2) {
  if (!isFiniteNumber(value)) return "N/A";
  const number = Number(value);
  const sign = number > 0 ? "+" : "";
  return `${sign}${formatNumber(number, digits)}`;
}

function formatPercent(value, digits = 1) {
  if (!isFiniteNumber(value)) return "N/A";
  return `${formatNumber(Number(value) * 100, digits)}%`;
}

function formatCurrency(value) {
  if (!isFiniteNumber(value)) return "N/A";
  return Number(value).toLocaleString("en-GB", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function debounce(fn, wait) {
  let timeoutId = null;
  return function debounced(...args) {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => fn.apply(this, args), wait);
  };
}

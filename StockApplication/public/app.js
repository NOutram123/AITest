const state = {
  stocks: [],
  quotes: new Map(),
  selectedSymbol: null,
  chartRange: 30,
  chart: null,
  refreshInterval: 120000,
  refreshTimer: null,
  backendReady: false
};

const elements = {
  trackedCount: document.querySelector("#tracked-count"),
  backendStatus: document.querySelector("#backend-status"),
  refreshIntervalSelect: document.querySelector("#refresh-interval-select"),
  settingsHint: document.querySelector("#settings-hint"),
  refreshAllButton: document.querySelector("#refresh-all-button"),
  searchForm: document.querySelector("#search-form"),
  searchInput: document.querySelector("#search-input"),
  searchStatus: document.querySelector("#search-status"),
  searchResults: document.querySelector("#search-results"),
  watchlistBody: document.querySelector("#watchlist-body"),
  watchlistEmpty: document.querySelector("#watchlist-empty"),
  watchlistFilter: document.querySelector("#watchlist-filter"),
  chartTitle: document.querySelector("#chart-title"),
  chartStatus: document.querySelector("#chart-status"),
  chartCanvas: document.querySelector("#stock-chart"),
  rangeSwitcher: document.querySelector("#range-switcher")
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindEvents();
  await checkHealth();
  await loadStocks();
  renderWatchlist();
  renderEmptyChart();
  if (state.backendReady && state.stocks.length) {
    await refreshQuotes();
    if (state.selectedSymbol) {
      await loadChart(state.selectedSymbol);
    }
  }
  startAutoRefresh();
}

function bindEvents() {
  elements.searchForm.addEventListener("submit", handleSearchSubmit);
  elements.refreshAllButton.addEventListener("click", refreshQuotes);
  elements.watchlistFilter.addEventListener("input", renderWatchlist);
  elements.refreshIntervalSelect.addEventListener("change", (event) => {
    state.refreshInterval = Number(event.target.value);
    startAutoRefresh();
  });
  elements.rangeSwitcher.addEventListener("click", (event) => {
    const button = event.target.closest(".range-button");
    if (!button) {
      return;
    }

    state.chartRange = Number(button.dataset.range);
    document.querySelectorAll(".range-button").forEach((item) => {
      item.classList.toggle("is-active", item === button);
    });

    if (state.selectedSymbol) {
      loadChart(state.selectedSymbol);
    }
  });
}

async function checkHealth() {
  try {
    const response = await fetch("/api/health");
    const data = await response.json();

    state.backendReady = data.ok;
    elements.backendStatus.textContent = data.hasApiKey ? "Ready" : "Missing API key";
    elements.settingsHint.textContent = data.hasApiKey
      ? "Backend is connected and ready to search quotes."
      : "Create a .env file from .env.example and add your Alpha Vantage key.";
  } catch (error) {
    elements.backendStatus.textContent = "Offline";
    elements.settingsHint.textContent = "Backend is not reachable yet.";
  }
}

async function handleSearchSubmit(event) {
  event.preventDefault();

  const query = elements.searchInput.value.trim();
  if (!query) {
    setStatus(elements.searchStatus, "Enter a company name or ticker.");
    return;
  }

  setStatus(elements.searchStatus, "Searching...");
  elements.searchResults.innerHTML = "";

  try {
    const response = await fetch(`/api/search?query=${encodeURIComponent(query)}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Search failed.");
    }

    if (!data.items.length) {
      setStatus(elements.searchStatus, "No results found.");
      return;
    }

    renderSearchResults(data.items);
    setStatus(elements.searchStatus, `${data.items.length} matches found.`);
  } catch (error) {
    setStatus(elements.searchStatus, error.message);
  }
}

function renderSearchResults(items) {
  const template = document.querySelector("#search-result-template");
  const fragment = document.createDocumentFragment();

  items.forEach((item) => {
    const node = template.content.firstElementChild.cloneNode(true);
    node.querySelector("h3").textContent = `${item.name} (${item.symbol})`;
    node.querySelector(".search-card__subtitle").textContent = [item.region, item.currency, item.type]
      .filter(Boolean)
      .join(" • ");
    node.querySelector("button").addEventListener("click", async () => {
      await addStock(item);
    });
    fragment.appendChild(node);
  });

  elements.searchResults.appendChild(fragment);
}

async function addStock(item) {
  const response = await fetch("/api/stocks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      symbol: item.symbol,
      companyName: item.name,
      exchange: item.region,
      currency: item.currency,
      type: item.type
    })
  });

  if (!response.ok) {
    setStatus(elements.searchStatus, "Unable to save stock.");
    return;
  }

  await loadStocks();
  renderWatchlist();
  await refreshQuotes();
  setStatus(elements.searchStatus, `${item.symbol} added to the watchlist.`);
}

async function loadStocks() {
  const response = await fetch("/api/stocks");
  const data = await response.json();
  state.stocks = data.items || [];

  if (!state.selectedSymbol && state.stocks[0]) {
    state.selectedSymbol = state.stocks[0].symbol;
  }

  elements.trackedCount.textContent = String(state.stocks.length);
}

function renderWatchlist() {
  const term = elements.watchlistFilter.value.trim().toLowerCase();
  const items = !term
    ? state.stocks
    : state.stocks.filter((stock) =>
        `${stock.companyName} ${stock.symbol} ${stock.exchange}`.toLowerCase().includes(term)
      );

  elements.watchlistEmpty.hidden = items.length > 0;
  elements.watchlistBody.innerHTML = "";

  items.forEach((stock) => {
    const quote = state.quotes.get(stock.symbol);
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(stock.companyName)}</td>
      <td>${escapeHtml(stock.symbol)}</td>
      <td>${escapeHtml(stock.exchange || "Unknown")}</td>
      <td>${quote ? `${quote.price.toFixed(2)} ${stock.currency || ""}` : '<span class="muted-inline">Pending</span>'}</td>
      <td class="${trendClass(quote?.change)}">${formatChange(quote)}</td>
      <td>${quote ? new Date(quote.updatedAt).toLocaleString() : '<span class="muted-inline">Never</span>'}</td>
      <td>
        <button class="button button--secondary" data-action="chart" type="button">Chart</button>
        <button class="button button--secondary" data-action="delete" type="button">Remove</button>
      </td>
    `;

    row.querySelector('[data-action="chart"]').addEventListener("click", () => {
      state.selectedSymbol = stock.symbol;
      loadChart(stock.symbol);
    });

    row.querySelector('[data-action="delete"]').addEventListener("click", async () => {
      await fetch(`/api/stocks/${encodeURIComponent(stock.symbol)}`, { method: "DELETE" });
      state.quotes.delete(stock.symbol);
      if (state.selectedSymbol === stock.symbol) {
        state.selectedSymbol = null;
      }
      await loadStocks();
      renderWatchlist();
      if (state.selectedSymbol) {
        loadChart(state.selectedSymbol);
      } else {
        renderEmptyChart();
      }
    });

    elements.watchlistBody.appendChild(row);
  });
}

async function refreshQuotes() {
  if (!state.stocks.length) {
    return;
  }

  elements.settingsHint.textContent = "Refreshing quotes...";

  try {
    const response = await fetch("/api/quotes");
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Quote refresh failed.");
    }

    data.items.forEach((item) => {
      if (!item.error) {
        state.quotes.set(item.symbol, item);
      }
    });

    renderWatchlist();
    elements.settingsHint.textContent = "Quotes updated.";
  } catch (error) {
    elements.settingsHint.textContent = error.message;
  }
}

function startAutoRefresh() {
  if (state.refreshTimer) {
    clearInterval(state.refreshTimer);
  }

  if (!state.refreshInterval) {
    return;
  }

  state.refreshTimer = setInterval(() => {
    refreshQuotes();
  }, state.refreshInterval);
}

async function loadChart(symbol) {
  const stock = state.stocks.find((item) => item.symbol === symbol);
  if (!stock) {
    renderEmptyChart();
    return;
  }

  elements.chartTitle.textContent = `${stock.companyName} (${stock.symbol})`;
  setStatus(elements.chartStatus, "Loading chart...");

  try {
    const response = await fetch(`/api/chart/${encodeURIComponent(symbol)}?range=${state.chartRange}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Unable to load chart.");
    }

    drawChart(data.items, stock.currency || "USD");
    setStatus(elements.chartStatus, `${data.items.length} daily points loaded.`);
  } catch (error) {
    renderEmptyChart();
    setStatus(elements.chartStatus, error.message);
  }
}

function renderEmptyChart() {
  if (state.chart) {
    state.chart.destroy();
    state.chart = null;
  }

  const ctx = elements.chartCanvas.getContext("2d");
  ctx.clearRect(0, 0, elements.chartCanvas.width, elements.chartCanvas.height);
  elements.chartTitle.textContent = "Select a stock";
  setStatus(elements.chartStatus, "Chart data will appear here.");
}

function drawChart(items, currency) {
  if (state.chart) {
    state.chart.destroy();
  }

  state.chart = new Chart(elements.chartCanvas, {
    type: "line",
    data: {
      labels: items.map((item) => item.label),
      datasets: [
        {
          label: `Close (${currency})`,
          data: items.map((item) => item.close),
          borderColor: "#2ef3ff",
          backgroundColor: "rgba(46, 243, 255, 0.16)",
          fill: true,
          tension: 0.25,
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: {
            color: "#dfefff"
          }
        }
      },
      scales: {
        x: {
          ticks: { color: "#8ea8bf" },
          grid: { color: "rgba(142, 168, 191, 0.08)" }
        },
        y: {
          ticks: { color: "#8ea8bf" },
          grid: { color: "rgba(142, 168, 191, 0.08)" }
        }
      }
    }
  });
}

function setStatus(node, message) {
  node.textContent = message;
}

function formatChange(quote) {
  if (!quote) {
    return '<span class="muted-inline">Pending</span>';
  }

  return `${quote.change.toFixed(2)} (${quote.changePercent})`;
}

function trendClass(change) {
  if (typeof change !== "number") {
    return "price-flat";
  }

  if (change > 0) {
    return "price-up";
  }

  if (change < 0) {
    return "price-down";
  }

  return "price-flat";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const path = require("path");
const fs = require("fs");
const express = require("express");
const Database = require("better-sqlite3");
require("dotenv").config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const API_KEY = process.env.ALPHA_VANTAGE_API_KEY || "";
const DB_DIR = path.join(__dirname, "data");
const DB_PATH = path.join(DB_DIR, "stocks.db");

fs.mkdirSync(DB_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS stocks (
    symbol TEXT PRIMARY KEY,
    company_name TEXT NOT NULL,
    exchange TEXT,
    currency TEXT,
    type TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

const insertStock = db.prepare(`
  INSERT INTO stocks (symbol, company_name, exchange, currency, type)
  VALUES (@symbol, @companyName, @exchange, @currency, @type)
  ON CONFLICT(symbol) DO UPDATE SET
    company_name = excluded.company_name,
    exchange = excluded.exchange,
    currency = excluded.currency,
    type = excluded.type
`);

const listStocks = db.prepare(`
  SELECT symbol, company_name AS companyName, exchange, currency, type, created_at AS createdAt
  FROM stocks
  ORDER BY company_name COLLATE NOCASE ASC
`);

const deleteStock = db.prepare(`DELETE FROM stocks WHERE symbol = ?`);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    provider: "Alpha Vantage",
    hasApiKey: Boolean(API_KEY)
  });
});

app.get("/api/stocks", (_req, res) => {
  res.json({
    items: listStocks.all()
  });
});

app.post("/api/stocks", (req, res) => {
  const payload = normalizeStockPayload(req.body);
  insertStock.run(payload);
  res.status(201).json({ item: payload });
});

app.delete("/api/stocks/:symbol", (req, res) => {
  deleteStock.run(req.params.symbol.toUpperCase());
  res.status(204).end();
});

app.get("/api/search", async (req, res) => {
  if (!API_KEY) {
    return res.status(400).json({ error: "Missing Alpha Vantage API key in .env." });
  }

  const query = (req.query.query || "").trim();
  if (!query) {
    return res.status(400).json({ error: "Search query is required." });
  }

  try {
    const data = await alphaVantageRequest("SYMBOL_SEARCH", { keywords: query });
    const items = (data.bestMatches || []).map((item) => ({
      symbol: item["1. symbol"],
      name: item["2. name"],
      type: item["3. type"],
      region: item["4. region"],
      currency: item["8. currency"],
      matchScore: item["9. matchScore"]
    }));

    res.json({ items });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.get("/api/quotes", async (_req, res) => {
  if (!API_KEY) {
    return res.status(400).json({ error: "Missing Alpha Vantage API key in .env." });
  }

  const stocks = listStocks.all();
  const items = [];

  for (const stock of stocks) {
    try {
      const data = await alphaVantageRequest("GLOBAL_QUOTE", { symbol: stock.symbol });
      const quote = data["Global Quote"];
      if (!quote || !quote["05. price"]) {
        items.push({
          symbol: stock.symbol,
          error: "No quote returned."
        });
        continue;
      }

      items.push({
        symbol: stock.symbol,
        price: Number(quote["05. price"]),
        change: Number(quote["09. change"] || 0),
        changePercent: quote["10. change percent"] || "0%",
        updatedAt: new Date().toISOString()
      });
    } catch (error) {
      items.push({
        symbol: stock.symbol,
        error: error.message
      });
    }
  }

  res.json({ items });
});

app.get("/api/chart/:symbol", async (req, res) => {
  if (!API_KEY) {
    return res.status(400).json({ error: "Missing Alpha Vantage API key in .env." });
  }

  const symbol = req.params.symbol.toUpperCase();
  const range = Math.min(Number(req.query.range || 30), 365);

  try {
    const data = await alphaVantageRequest("TIME_SERIES_DAILY", {
      symbol,
      outputsize: "compact"
    });

    const series = data["Time Series (Daily)"];
    if (!series) {
      return res.status(404).json({ error: `No chart data returned for ${symbol}.` });
    }

    const points = Object.entries(series)
      .map(([date, values]) => ({
        label: date,
        close: Number(values["4. close"])
      }))
      .sort((left, right) => new Date(left.label) - new Date(right.label))
      .slice(-range);

    res.json({ items: points });
  } catch (error) {
    res.status(502).json({ error: error.message });
  }
});

app.use((_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Pulseboard Stocks running on http://localhost:${PORT}`);
});

function normalizeStockPayload(body) {
  return {
    symbol: String(body.symbol || "").trim().toUpperCase(),
    companyName: String(body.companyName || body.name || "").trim(),
    exchange: String(body.exchange || body.region || "").trim(),
    currency: String(body.currency || "").trim(),
    type: String(body.type || "").trim()
  };
}

async function alphaVantageRequest(fn, params) {
  const search = new URLSearchParams({
    function: fn,
    apikey: API_KEY,
    ...params
  });

  const response = await fetch(`https://www.alphavantage.co/query?${search.toString()}`);
  const data = await response.json();

  if (data.Note) {
    throw new Error("Alpha Vantage rate limit reached. Try again shortly.");
  }

  if (data.Information) {
    throw new Error(data.Information);
  }

  if (data["Error Message"]) {
    throw new Error(data["Error Message"]);
  }

  return data;
}

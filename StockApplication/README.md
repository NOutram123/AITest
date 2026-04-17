# Pulseboard Stocks

Pulseboard Stocks is a starter stock dashboard built for personal use with:

- `Express` for the local web server
- `SQLite` for the stock watchlist database
- `Alpha Vantage` for stock search, quotes, and daily chart data
- `Chart.js` for chart rendering

## Setup

1. Copy `.env.example` to `.env`
2. Add your Alpha Vantage API key:

```env
ALPHA_VANTAGE_API_KEY=your_real_key_here
PORT=3000
```

3. Install dependencies:

```powershell
"C:\Program Files\nodejs\npm.cmd" install
```

4. Start the app:

```powershell
"C:\Program Files\nodejs\node.exe" server.js
```

5. Open [http://localhost:3000](http://localhost:3000)

## Current scope

- Add stocks by company name or ticker
- Persist tracked stocks in SQLite
- Refresh quotes for tracked stocks
- View a daily price chart for the selected stock
- Futuristic dashboard styling

## Deferred for later

- Gold and silver scrolling bar
- Portfolio tracking fields such as holdings and P/L
- Stronger caching and scheduled refresh behavior
- Provider abstraction for switching from Alpha Vantage later

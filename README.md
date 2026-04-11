# Grain of Rain

A client-side weather data analysis tool for exploring weather history across multiple cities.

🌐 **[Try it live](https://grainofrain.gramoflava.xyz)** | 📦 **[Source code](https://github.com/gramoflava/grainofrain)**

## Philosophy

**Grain of Rain** is built on four core principles:

### 1. Complete Client-Side Operation
- No own backend or server infrastructure — runs entirely in your browser
- Direct integration with third-party open weather APIs (Open-Meteo and optional IP geolocation)
- We do not need your data to operate the app — the goal is to give you direct access to open data
- No accounts, no tracking, no app-side data collection

### 2. Single-Screen Information Density
- All relevant data visible at once on desktop within reason — no hidden panels for the core workflow
- Compare up to 3 cities or time periods side-by-side in a single view
- Statistical summaries and visual charts coexist on one page
- Dense information presentation without clutter
- Responsive layout for mobile and tablet with natural scrolling

### 3. Exploration and Analysis Focus
- Historical weather data analysis across custom date ranges
- Cross-city comparisons to identify patterns and anomalies
- Periodic analysis to compare climate evolution across years
- Climate deviation tracking (actual vs. climate normals)
- Flexible date ranges from single days to full years

### 4. Cache-First Efficiency
- Cache weather requests locally to keep repeat views fast and reduce unnecessary API traffic
- Prefetch enough padding for all available smoothing windows so switching smoothing does not normally trigger another request
- Work within third-party API rate limits while trying to keep the experience smooth

## Analysis Modes

**Grain of Rain** offers four distinct analysis modes:

### Overview Mode
- Analyze 1-3 cities simultaneously over a custom date range
- Compare weather patterns across different locations
- Optional data smoothing (5 or 14 days) for clearer trends
- Perfect for travel planning and location comparison

### Periodic Mode
- Compare the same time period across different years (e.g., summer 2015 vs. 2020 vs. 2025)
- Visualize climate change and seasonal shifts over time
- Track how specific periods have evolved in a single location
- Optional data smoothing for trend analysis

### Progression Mode
- Study how a specific day, month, or season has changed over decades
- Year-over-year progression analysis (e.g., how January 4th changed from 1984 to 2025)
- Long-term climate trend visualization
- Aggregated data across multi-year ranges

### Raw Data Management Mode
- Browse, inspect, and manage all locally cached weather data
- Collapsible city tree with per-entry storage size indicators
- Load ERA5 parameters across multiple groups for any city and date range — beyond what the other modes fetch
- Preview any stored dataset as a chart; aggregate entries include a field picker to switch between all available parameters
- Selectively delete individual entries to free up space

## Value Proposition

The tool serves users who need to:
- Analyze historical weather patterns for research or planning
- Compare climate conditions across different locations
- Study temperature, precipitation, humidity, and wind data
- Export insights as images for reports or documentation

## Technical Approach

Built with vanilla JavaScript and minimal dependencies to ensure:
- Fast loading and instant responsiveness
- Long-term maintainability without framework lock-in
- Full transparency — inspect and understand every line
- Cached datasets remain available locally, while new searches and uncached ranges still depend on third-party APIs
- Persistent local cache via IndexedDB — previously fetched data loads instantly on return visits
- Request padding is prefetched for the available smoothing windows to avoid unnecessary repeat fetches when switching smoothing
- Icons: 28px from [Tabler Icons](https://tabler.io/icons)

## Development Philosophy

This is a **pure vibe-coded app** — developed through intuitive iteration and direct user feedback rather than upfront specifications. Features emerge from actual needs, the interface evolves toward clarity, and technical decisions favor simplicity over abstraction.

---

**Grain of Rain** is weather analysis without the cruft — just you, the data, and open APIs.

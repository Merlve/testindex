# Shindex

Shindex is a sleek, unified frontend dashboard that integrates with your existing media infrastructure (such as Jellyfin and Openlist). Built with React and TypeScript, Shindex offers a beautiful dark-mode interface, rich media presentation (using the TMDB API), and comprehensive search functionality, replacing standard views with a highly polished and curated user experience.

## Features

- **Dashboard**: A stunning, modern UI with an interactive hero slider for featured content (supports touch/mouse swiping, smooth liquid glass navigation arrows), trending carousels, and category-based grids.
- **Dynamic Genres List**: A beautiful all-genres page with intelligent backdrop image caching (caches the best backdrop from a genre for 7 days) mapped precisely to TMDB.
- **Personalized 'For You' Recommendations**: A dedicated recommendations page suggesting new content based on user watchlists, automatically filtered to only display items that are actually available in your local library.
- **Watchlist Functionality**: Users can easily save items to their personal watchlist for later viewing.
- **Mobile-responsive Bottom Navigation**: A sleek, floating bottom navigation bar that ensures a native-app-like experience on mobile and tablet devices.
- **Unified Media View**: Seamlessly fetch and display media from Jellyfin and Openlist.
- **Smart Integration**: Supports overrides, watchlists, TMDB enrichment (for enhanced metadata, ratings, and posters), and even Telegram notifications for recently added media.
- **PWA & Mobile Ready**: Responsive, fluid layouts utilizing Tailwind CSS and Framer Motion.
- **Skeleton Loaders**: Modern UI skeleton screens ensure a smooth perceived performance during data fetching.
- **Advanced User Management**: Admins can easily manage users with batch operations, import/export functionality, bulk password resets, permission bitmask controls, real-time status updates, and account expiration dates.
- **Automated & Real-Time Expirations**: Built-in real-time enforcement and recurring 30-second background worker automatically disable user accounts when they reach their set expiration date or attempt login post-expiration.
- **Resilient Master Proxy Fallback**: Admin operations on Openlist endpoints automatically retry with the master API key if user session tokens lack admin privileges.
- **Activity Logging**: Comprehensive admin activity logs to audit user modifications, system actions, and cron jobs.
- **TMDB Auto-fetch**: Automate TMDB metadata fetching across media libraries with start and stop capabilities.

## Prerequisites

- **Docker** and **Docker Compose**
- *(Optional but recommended)* Node.js 22+ if you wish to run it locally without Docker.

## Configuration (.env)

Shindex relies on environment variables for configuration. You can supply these directly to Docker or via a `.env` file if running locally.

### Key Variables

| Variable | Description |
|---|---|
| `SERVER_PORT` | The port the internal Node server runs on (default `3000`, mapped to `4344` in Docker). |
| `GEMINI_API_KEY` | Required if utilizing AI search and enrichment features. |
| `APP_URL` | The public facing URL where Shindex is hosted. |
| `TMDB_API_KEY` | Required to fetch high-quality posters and metadata for media items. |
| `OPENLIST_SERVER_URL` | The URL of your openlist server (e.g., `https://my-openlist.com`). |
| `OPENLIST_API_KEY` | Your Openlist API key. |
| `JELLYFIN_URL` | The internal/external URL to your Jellyfin instance. |
| `JELLYFIN_API_KEY` | Your Jellyfin API key. |
| `JELLYFIN_USER_ID` | The specific user ID in Jellyfin to fetch media against. |
| `TELEGRAM_BOT_TOKEN` | (Optional) For sending notifications to a Telegram channel. |
| `TELEGRAM_CHAT_ID` | (Optional) The channel ID for Telegram notifications. |

You can copy the provided `.env.example` to configure your environment:
```bash
cp .env.example .env
# Edit .env with your credentials
```

## Docker Installation (Recommended)

Shindex is containerized and configured via `docker-compose.yml`.

## Breaking Change (SQLite Migration)

In recent updates, Shindex has moved all local JSON flat-files to a robust local SQLite database to prevent file locking (`EBUSY`/`EISDIR`) issues and data corruption on Docker.

**If you are updating from an older version:**
1. Update your `docker-compose.yml` to only mount `./data:/app/data` (remove all the individual `.json` file volumes).
2. If you still have the old JSON files in your directory, the new container will automatically migrate their contents into the new SQLite database on first boot.

1. **Clone the repository:**
   ```bash
   git clone <repo-url>
   cd shindex
   ```

2. **Prepare data files:**
   The `docker-compose.yml` mounts the `data` directory so data persists across container restarts. Ensure this directory exists or let Docker create it.

All JSON files have been seamlessly migrated to a high-performance local SQLite database (`data/shindex.db`), significantly improving concurrent access and data integrity.

3. **Configure your environment variables:**
   Ensure you have provided the necessary environment variables either by creating a `.env` file in the same directory as the `docker-compose.yml` or exporting them in your terminal.

4. **Start the container:**
   ```bash
   docker-compose up -d
   ```
   The container will build the app and start it up. It will be accessible at `http://localhost:4344` by default.

### Changing Ports

If port `4344` is already in use or you prefer a different external port, you can change it in the `docker-compose.yml`:
```yaml
    ports:
      - "8080:4344" # Exposes the app on port 8080 externally
```
*Note: The internal `SERVER_PORT` is set to `4344` inside the container. You generally only need to change the left side of the port mapping (`HOST_PORT:CONTAINER_PORT`).*

## Local Development (Without Docker)

If you wish to develop or run the application directly on your host machine:

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run in development mode:**
   ```bash
   npm run dev
   ```
   This will start the Vite dev server with Hot Module Replacement (HMR).

3. **Build for production:**
   ```bash
   npm run build
   ```
   This command bundles both the React frontend and the Express backend into the `dist/` directory.

4. **Start the production server:**
   ```bash
   npm start
   ```

## Admin Features

Shindex includes an admin interface to manage site config and overrides.
To access it, you must be logged in as a user with admin privileges (usually mapped by configuring the `admin` username or matching the main Openlist admin credentials).

- **Route:** Navigate to `/admin`
- **Capabilities:**
  - **User Management:** Import/export users, bulk set passwords, manage user expirations, enable/disable accounts.
  - **Site Configuration:** Modify site name, logo, description, base paths, and configure an automatic inactivity logout timer.
  - **Activity Logs:** Audit log dashboard for tracking settings changes, user operations, and automatic background cron executions.
  - **TMDB & Jellyfin Management:** Flush caches, manually override incorrectly mapped TMDB media, start/stop automated TMDB metadata fetches.

## Troubleshooting

- **Guest Access Denied:** Ensure Openlist is responding correctly and that guest authentication is enabled on the backend server.
- **Images Not Loading:** Ensure you have provided a valid `TMDB_API_KEY`. TMDB is used as a fallback and enhancer for almost all imagery in the app.
- **Port Conflicts:** If `docker-compose up` fails, check if another service is using port `4344` and adjust the port mapping in `docker-compose.yml`.

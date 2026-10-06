# Badminton Live Scoring & Ranking

A browser based badminton scoring app for running matches, tracking game scores, and reviewing player and match statistics. The application is served by a small Express server and stores match and player data in MySQL.

## Features

- Live singles scoring with player and country details
- Match and game history, including final scores and match duration
- Player profiles and individual player history
- Rankings based on recorded match results
- Viewer page for displaying the current scoreboard
- Custom country entries
- MySQL tables are created or updated when the server starts

The app does not currently include a login or registration flow.

## Requirements

- Node.js 18 or newer
- MySQL 8.0 or a compatible MySQL server

## Setup

1. Clone the repository and open its folder:

   ```sh
   git clone https://github.com/saurav13singh2003-crypto/Badminton-Live-Scoring-Platform.git
   cd Badminton-Live-Scoring-Platform
   ```

2. Install dependencies:

   ```sh
   npm install
   ```

3. Create a MySQL database. For example, from a MySQL client:

   ```sql
   CREATE DATABASE badminton_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

4. Set the connection variables in a local `.env` file in the project root. `.env` is ignored by Git, so credentials stay on your machine:

   ```dotenv
   PORT=4000
   DB_HOST=127.0.0.1
   DB_PORT=3307
   DB_USER=root
   DB_PASSWORD=your_mysql_password
   DB_NAME=badminton_db
   ```

   `DB_PORT` defaults to `3307` in this project. Set it to your MySQL server's port (commonly `3306`) if needed. The database user needs permission to create and update tables.

5. Start the app:

   ```sh
   npm start
   ```

   Open [http://localhost:4000](http://localhost:4000). Change `PORT` in `.env` if you want to use another port.

## Pages

| Page | URL | Purpose |
| --- | --- | --- |
| Scoreboard | `/` | Set up and score a live match |
| Viewer | `/viewer.html` | Display the current scoreboard |
| Match history | `/history.html` | Browse completed and in progress matches |
| Rankings | `/ranking.html` | Review player standings and records |
| Player history | `/player-history.html` | View an individual player's match history |

The scoreboard and viewer share the latest saved state through the server. Keep the Node server running while using the pages.

## Data storage

On startup, the server connects to MySQL and ensures the tables used by the application exist. Player records, matches, games, custom countries, match logs, and scoreboard state are stored in the configured database. Back up the database regularly to preserve match history.

## API

The Express API is mounted at `/api`. Main endpoint groups include:

- `GET/POST/DELETE /api/custom-countries`
- `GET/POST /api/match-log` and `GET/POST /api/latest-state`
- `GET/POST /api/players`, `PUT/DELETE /api/players/:id`
- `POST /api/matches`, `POST /api/matches/:id/games`, `GET /api/matches/history`
- `POST` or `PATCH /api/games/:id/score` and `/api/games/:id/finish`
- `POST` or `PATCH /api/matches/:id/finish`

## Tech stack

- Node.js and Express
- MySQL with `mysql2`
- HTML, CSS, and browser JavaScript

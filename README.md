# Badminton Hub

Badminton Hub is a browser based badminton scoring and ranking platform. It includes a responsive dashboard, match input and scoring controls, a live broadcast display, match history, player rankings, and individual player profiles. The app uses an Express API and MySQL to persist player and match data.

## Features

- Responsive dark sports dashboard with links to each part of the app
- Live singles scoring across best of three games, with start, pause, reset, and broadcast controls
- Match timer that pauses at the end of each game and asks before starting the next one
- Live viewer that reflects score updates and displays player portraits and country flags
- Persistent player roster with database reload, country, age, height, weight, playing hand, and photo URL fields
- Player profile pages with career statistics, profile details, and expandable match history
- Match history and rankings with “show more” pagination
- Shared sticky navigation and a badminton themed background across the app
- Database schema initialization and migrations when the server starts

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

3. Create a MySQL database:

   ```sql
   CREATE DATABASE badminton_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

4. Add a `.env` file in the project root with your database connection settings:

   ```dotenv
   PORT=4000
   DB_HOST=127.0.0.1
   DB_PORT=3307
   DB_USER=root
   DB_PASSWORD=your_mysql_password
   DB_NAME=badminton_db
   ```

   `DB_PORT` defaults to `3307` in this project. Change it to your MySQL server's port if needed, commonly `3306`. The database user needs permission to create and update tables. Keep `.env` private; it is ignored by Git.

5. Start the app:

   ```sh
   npm start
   ```

   Open [http://localhost:4000](http://localhost:4000). The server requires an available MySQL database to start.

For VS Code Live Server, open the project root or `public/index.html`. The root `index.html` forwards to the dashboard under `public/` so Live Server opens the app instead of showing a directory listing. API-backed features still require the Node server and MySQL to be running.

## Pages

| Page | URL | Description |
| --- | --- | --- |
| Home dashboard | `/` | Dashboard and navigation to scoring, live broadcast, history, and rankings |
| Match input | `/input.html` | Select players, edit player details, and score a match |
| Live Broadcast | `/viewer.html` | Read-only live scoreboard with player photos and country flags |
| Match History | `/history.html` | Review completed and in-progress matches |
| Rankings | `/ranking.html` | Browse player standings, records, and win rates |
| Player profile | `/player-profile.html?player=PLAYER_NAME` | View player details, statistics, and match history |

## Match workflow

1. Choose two saved players on the Match Input page, or add players and their profile details.
2. Start the match and use the `+1` controls to update scores.
3. At the end of a game, the timer stops. Confirm the prompt to continue to the next game, or cancel and resume later with **Start Match**.
4. Open Live Broadcast to display the current game. Match results and player records appear in history, rankings, and player profiles.

The Match Input and Live Broadcast pages share score state through browser messaging and the server's latest-state endpoint. Keep the Node server running for database persistence and cross-page updates.

## Data storage

MySQL stores players, player profile details, countries, matches, games, match logs, and the latest scoreboard state. The server creates or updates required tables when it starts. The Match Input page can reload the roster from the database; it also keeps a browser copy available if the database cannot be reached temporarily. Back up the database regularly to preserve your records.

## API overview

The Express API is mounted at `/api`. Main endpoint groups include:

- `GET`, `POST`, and `DELETE /api/custom-countries`
- `GET` and `POST /api/match-log`
- `GET` and `POST /api/latest-state`
- `GET` and `POST /api/players`; `PUT` and `DELETE /api/players/:id`
- `POST /api/matches`; `POST /api/matches/:id/games`; `GET /api/matches/history`
- `POST` or `PATCH /api/games/:id/score` and `/api/games/:id/finish`
- `POST` or `PATCH /api/matches/:id/finish`

## Technology

- Node.js and Express
- MySQL with `mysql2`
- HTML, CSS, and browser JavaScript

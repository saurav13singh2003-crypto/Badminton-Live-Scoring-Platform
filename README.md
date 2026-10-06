# Badminton Live Scoring & Ranking

Authentication has been removed from the application. The scoreboard opens directly without any login screen, registration flow, or email-based user session.

## Start

Copy `.env.example` to `.env` and fill in the MySQL connection values if you want to use the database-backed scoreboard state. Then run:

```powershell
npm start
```

The live input page, viewer page, history page, and ranking page all work without any login or email authentication.

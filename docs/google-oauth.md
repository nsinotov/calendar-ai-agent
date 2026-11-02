# Getting a Google refresh token

Each user needs their own refresh token for `pnpm add-user`. While the OAuth app's publishing status is Testing, first add the user's Google account under Cloud Console → OAuth consent screen → Audience → Test users.

1. Open this URL with your client ID, sign in as the user and allow access:

   ```text
   https://accounts.google.com/o/oauth2/v2/auth?client_id=<CLIENT_ID>&redirect_uri=http://localhost&response_type=code&access_type=offline&prompt=consent&scope=https://www.googleapis.com/auth/calendar
   ```

2. The browser is redirected to `http://localhost/?code=...` (the page itself won't load). Copy the `code` value and replace `%2F` with `/`.
3. Exchange the code for tokens within a few minutes:

   ```bash
   curl -X POST https://oauth2.googleapis.com/token \
     -d client_id=<CLIENT_ID> -d client_secret=<CLIENT_SECRET> -d code=<CODE> \
     -d redirect_uri=http://localhost -d grant_type=authorization_code
   ```

4. Use the `refresh_token` from the response in `pnpm add-user`.

> **Note:** The token stops working if the user changes their Google password. Google also expires it after 7 days while the app's publishing status is Testing; publish the app to avoid that. In both cases, repeat these steps and run `add-user` again with the same Telegram ID.

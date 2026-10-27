# Boyle Family Hub

Family to-dos, calendar, meals, and groceries. Live at [justinboyle26-rgb.github.io/Boyle-Family-Hub](https://justinboyle26-rgb.github.io/Boyle-Family-Hub/).

The page does not read or write the family database until someone signs in with the **family email and password**.

## One-time Firebase console steps

Do these in [Firebase console](https://console.firebase.google.com/) → project **boyle-family-hub-2533b**. The app cannot finish this for you.

1. **Authentication** → **Sign-in method** → enable **Email/Password**.
2. **Authentication** → **Settings** → **Authorized domains** — add:
   - `justinboyle26-rgb.github.io`
   - `localhost` (for local testing)
3. **Realtime Database** → **Rules** — paste the contents of `database.rules.json` and **Publish**:

```
{
  "rules": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}
```

Until those rules are published, anyone who knows the database URL can still read and write family data even if the login screen is showing.

4. Create the family user **once**. Either add it under **Authentication → Users → Add user**, or open the hub with `?create=1` (example: `https://justinboyle26-rgb.github.io/Boyle-Family-Hub/?create=1`) and tap **Create family account**. The create button is hidden on the normal URL so strangers cannot mint an account.
5. On every tablet and phone, open the hub **without** `?create=1` and **Sign in** with that same email. The device stays signed in until you sign out in Settings.

Optional tighter lock: after you know the family email, change rules to that address only:

```
{
  "rules": {
    ".read": "auth != null && auth.token.email == 'YOUR_FAMILY_EMAIL'",
    ".write": "auth != null && auth.token.email == 'YOUR_FAMILY_EMAIL'"
  }
}
```

## Deploy rules from a computer (optional)

If the Firebase CLI is installed and you are logged into this project:

```
firebase deploy --only database
```

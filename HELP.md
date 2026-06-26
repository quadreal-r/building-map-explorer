# How to work in this project

## To run the project

- In the top bar of cursor, select view -> terminal
- Type and enter "npm run dev", the project will then be running locally on your machine at "http://localhost:5173/"
- Enter that url in the browser to access your site
- If the page is blank or won't load:
  - Make sure the dev server is still running in the terminal (no errors)
  - Run `npm install` if you just pulled new code
  - Copy `.env.example` to `.env.local` and add your Google Maps API key
  - In the browser, open DevTools → Application → Local Storage and delete `bme-portfolio` if data looks corrupted, then refresh
- Changes to the code will automatically be reflected onto the site, no need to restart the website, you can simply refresh the page


## To make code changes

- When you want to implement something new, you should start a new chat (new agent in top left)
- type "/programmer" first then ask for your feature (ex: "/programmer make all buttons blue")
- When it is done working, it will ask you to verify everything works, keep working with the agent until you are satisfied
- You may want to run the command "npm test" after its done its work, it should say all tests pass - if it doesnt just copy the output of the terminal and give it to the agent and tell it to fix it. Then make sure npm test is all passed and continue to next step.
- Once done, you can say "Everything is good now, push the code"

## To commit and push

There is no `npm run commit` or `npm run push`. Use git from the project folder.

### Git workflow (code changes)

If you use **Settings → Sync**, GitHub Actions may commit to `main` while you work locally. **Pull before you push** so you do not get `rejected (fetch first)`.

```powershell
cd C:\Users\Robert\Projects\building-map-explorer
git pull origin main
npm test
git status
git add .
git commit -m "fix: short description of what changed"
git push origin main
```

Pushing to **main** triggers GitHub Actions, which builds and publishes the site to GitHub Pages.

**Push rejected?** Remote has commits you do not have (often from Settings sync):

```powershell
git pull origin main
git push origin main
```

If `git pull` reports merge conflicts, fix the listed files, then:

```powershell
git add .
git commit -m "merge: integrate remote main"
git push origin main
```

Or tell the agent: **"Everything is good now, push the code"** (it will pull, merge, and push when needed).

### Code changes (features, UI, fixes)

After `npm test` passes, use the [Git workflow](#git-workflow-code-changes) above.

### Map / portfolio data changes

**Recommended:** Settings → **Save & deploy** → **Sync to Cloudflare & GitHub**

- Uploads your local changes via GitHub Actions
- CI may commit and push for you (`chore: sync portfolio and RTU pictures from Settings`)
- No manual git needed if sync succeeds
- **Repo secret:** add the same GitHub token as Settings under repository secret `BME_SYNC_PAT` (needs **repo** Contents read/write and **workflow** scopes) — used by Settings in the browser to upload the staging bundle; CI uses the built-in `GITHUB_TOKEN` to commit and push
- Sync uploads your bundle to branch `bme-sync-staging` in the same repo; CI reads it from there (no gists)

**Manual fallback** (if sync fails or bundle is too large):

```powershell
npm run apply-deploy-bundle
git add supabase/data public/database/rtu-pictures/manifest.json
git commit -m "chore: update portfolio data and RTU picture manifest"
git push origin main
```

### RTU pictures missing online (local shows them)

Local uploads live in **IndexedDB** until you **Settings → Sync to Cloudflare & GitHub**. Git push alone does not upload pictures.

If RTU names on the map include a long description (e.g. `RTU-04 Hybrid/Dual Fuel Heat Pump`), pictures may not match the manifest key (`RTU-04 Hybrid`). On load, the app now shortens those names and re-links local pictures automatically. Then:

1. Open the site where your pictures exist (local dev or deployed, same browser)
2. Refresh once (watch for a toast: “Fixed RTU name(s)…”)
3. Open **2320 Bristol Circle** → **RTU-04 Hybrid** — confirm pictures show (1/2 if you have two)
4. **Settings → Sync to Cloudflare & GitHub**
5. Wait for the sync-deploy workflow, then hard-refresh the live site

### Before you push

- Never commit `.env.local` (secrets) — it is gitignored
- Do not commit `deploy-bundle.json` (gitignored; can be very large)
- After **Settings → Sync**, run `git pull origin main` before your next code push (see [Git workflow](#git-workflow-code-changes))

## Tips
- For complex requests: When you do "/programmer do this feature" press the plus button on the left side of the chat box and select "plan" and then on the far right of the chat box where it says "auto", click that, uncheck auto, then change that to "Opus" and then send your request. It will build out a plan for your feature, the plan should open when its done and you will see a button that says "Build plan" and the agent select next to it "Auto" (leave it on auto) then press build plan. This will generally give you better results for what you want to do 
    - If the request is fairly simple, you don't have to do this whole plan process, you can just do "/programmer do this thing" directly
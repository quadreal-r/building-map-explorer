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

There is no `npm run commit` or `npm run push`. Use git from the project folder:

```powershell
cd C:\Users\Robert\Projects\building-map-explorer
git status
git add .
git commit -m "Describe your change here"
git push origin main
```

Pushing to **main** triggers GitHub Actions, which builds and publishes the site to GitHub Pages.

### Code changes (features, UI, fixes)

After `npm test` passes:

```powershell
git add .
git commit -m "fix: short description of what changed"
git push origin main
```

Or tell the agent: **"Everything is good now, push the code"**.

### Map / portfolio data changes

**Recommended:** Settings → **Save & deploy** → **Sync to Cloudflare & GitHub**

- Uploads your local changes via GitHub Actions
- CI may commit and push for you (`chore: sync portfolio and RTU pictures from Settings`)
- No manual git needed if sync succeeds
- **Repo secret:** add the same GitHub token as Settings under repository secret `BME_SYNC_PAT` (needs **repo** Contents read/write and **workflow** scopes)
- Sync uploads your bundle to branch `bme-sync-staging` in the same repo; CI reads it from there (no gists)

**Manual fallback** (if sync fails or bundle is too large):

```powershell
npm run apply-deploy-bundle
git add supabase/data public/database/rtu-pictures/manifest.json
git commit -m "chore: update portfolio data and RTU picture manifest"
git push origin main
```

### Before you push

- Never commit `.env.local` (secrets) — it is gitignored
- Do not commit `deploy-bundle.json` (gitignored; can be very large)
- If push is rejected: `git pull origin main`, resolve conflicts, then push again

## Tips
- For complex requests: When you do "/programmer do this feature" press the plus button on the left side of the chat box and select "plan" and then on the far right of the chat box where it says "auto", click that, uncheck auto, then change that to "Opus" and then send your request. It will build out a plan for your feature, the plan should open when its done and you will see a button that says "Build plan" and the agent select next to it "Auto" (leave it on auto) then press build plan. This will generally give you better results for what you want to do 
    - If the request is fairly simple, you don't have to do this whole plan process, you can just do "/programmer do this thing" directly
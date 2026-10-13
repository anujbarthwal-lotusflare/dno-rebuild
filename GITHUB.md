# Hosting on GitHub

## What goes where

| Part | Where | Notes |
| --- | --- | --- |
| Source code (backend, NestJS, portal) | A GitHub repository | `.gitignore` leaves out `node_modules`, builds, the local database and layout files. |
| Clickable demo | GitHub Pages | `pages/index.html`: the portal with its backend running in the browser on sample data, neutral "DNO Portal demo" branding. Changes a visitor makes stay in their own browser. |
| The full app with a shared database | Not GitHub | GitHub Pages only serves static files. Run it on a server (any Node.js 22 host) with `npm run serve`. |

## Publish

1. Create an empty repository on github.com (no README), for example `dno-rebuild`.
   Choose **Private** unless the code may be public: it is a rebuild of the DNO portal.
2. In Terminal:

   ```bash
   cd ~/Documents/dno-rebuild
   git init -b main
   git add .
   git commit -m "DNO rebuild: core, NestJS API, Customer Care Suite portal"
   git remote add origin https://github.com/<you>/dno-rebuild.git
   git push -u origin main
   ```

3. Optional, needs GitHub Pro for a private repository: **Settings > Pages > Build and deployment >
   Source: GitHub Actions**, then run **Publish demo to GitHub Pages** from the **Actions** tab. The
   site appears at `https://<you>.github.io/dno-rebuild/`. Until then the demo is shared through the
   Claude demo page.

GitHub Pages sites are public on Free, Pro and Team plans, even when the repository is private.
Only GitHub Enterprise Cloud can limit a Pages site to signed-in members of the organization.

## Update the demo

After changing the portal, rebuild `pages/index.html` (ask Claude, or run the demo build) and push.

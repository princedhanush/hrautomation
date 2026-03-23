# Candidate Evaluation Dashboard

This is a production-ready Node.js Dashboard for evaluating candidates via the n8n AI engine.

## Deploying to the Cloud for Free (Render.com)

Since you want to share this internally with your manager, deploying this to a cloud platform like Render is perfect because it takes exactly 2 minutes and is free.

**Steps to deploy:**
1. **Push to GitHub**: Upload this folder to a GitHub repository (it can be private).
2. **Go to [Render.com](https://render.com/)** and create a free account.
3. Click **New +** and select **Web Service**.
4. Connect your GitHub account and select your repository.
5. In the Render configuration:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
6. Under **Advanced**, select **Add Disk** (since we are using SQLite, we need persistent storage so candidate data doesn't wipe on restart):
   - **Name**: `database`
   - **Mount Path**: `/opt/render/project/src/data` (You can also change your `server.js` to write to `data/database.sqlite`)

*Click Deploy!* Within minutes you will have a live `https://your-dashboard.onrender.com` link you can share with your manager!

## Starting Locally
If you just want to run it on your own machine:
```bash
npm install
node server.js
```
Then visit `http://localhost:3000`

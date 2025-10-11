# GHL Webhook Processor

This webhook processor receives data from Go High Level and transforms it to send parent information as the primary contact and student information in custom fields.

## Quick Deploy to Railway

1. **Install Railway CLI:**
   ```bash
   npm install -g @railway/cli
   ```

2. **Login to Railway:**
   ```bash
   railway login
   ```

3. **Deploy:**
   ```bash
   railway up
   ```

4. **Set your GHL webhook URL:**
   ```bash
   railway variables set GHL_WEBHOOK_URL=https://your-actual-ghl-instance.com/webhook-endpoint
   ```

5. **Get your public URL:**
   ```bash
   railway domain
   ```

## Alternative: Deploy to Render

1. Connect your GitHub repo to Render
2. Set environment variable: `GHL_WEBHOOK_URL=https://your-actual-ghl-instance.com/webhook-endpoint`
3. Deploy

## Usage

Once deployed, configure Go High Level to send webhooks to your public URL:
- Railway: `https://your-app-name.railway.app/webhook`
- Render: `https://your-app-name.onrender.com/webhook`

## Local Development

```bash
npm install
npm start
```

The server will run on `http://localhost:3000/webhook`

# Delivery Coordinator

A mobile-friendly web application to coordinate food parcel deliveries from a central point to scattered recipients. Uses a Google Sheet as the backend database and displays recipients as interactive pins on a map.

## Disclaimer
Every single line of code in this repo is coded with agents. Claude Opus mostly :)

## Features

- 🗺️ Interactive OpenStreetMap interface (free, no API key required)
- 📍 Color-coded markers (Red: Pending, Yellow: In Progress, Green: Delivered)
- 📱 Mobile-friendly responsive design
- 🔐 Multiple access codes with rate limiting
- 📊 Real-time delivery statistics
- 🔍 Filter by status and faculty
- 📞 Click-to-call phone numbers
- 📍 "Locate Me" GPS button

## Getting Started

### Prerequisites

1. **Google Cloud Service Account:**
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Create a new project or select existing
   - Enable the **Google Sheets API**
   - Create a Service Account and download the JSON key file

2. **Google Sheet Setup:**
   - Create a Google Sheet with these columns:
     - A: `ID` (Unique identifier for each row - **REQUIRED**)
     - B: `Google Map Link` (URL with coordinates)
     - C: `Latitude` (auto-populated from link, or "error" if parsing fails)
     - D: `Longitude` (auto-populated from link, or "error" if parsing fails)
     - E: `Recipient Type` (e.g., "Girls", "Boys")
     - F: `Parcels` (Number)
     - G: `Faculty` (e.g., "Computing")
     - H: `Phone` (Primary phone number)
     - I: `Secondary Phone` (Optional backup number)
     - J: `Status` ("Pending", "On the way", or "Delivered")
   - Share the sheet with your Service Account email (Editor access)
   - **Note:** Latitude/Longitude are auto-filled when the app reads the sheet. Leave them blank initially.

### Environment Setup

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

Required variables:
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` - Your service account email
- `GOOGLE_PRIVATE_KEY` - Private key from the JSON file (keep the \n characters)
- `GOOGLE_SHEET_ID` - The ID from your Google Sheet URL
- `ACCESS_CODES` - Comma-separated list of access codes (e.g., "driver1,driver2,driver3")
- `ADMIN_ACCESS_CODE` - (Legacy) Single shared password, still supported

### Security Features

- **Multiple Access Codes:** Use `ACCESS_CODES` to give each driver their own code. Revoke individual access by removing their code.
- **Rate Limiting:** Login is limited to 5 failed attempts per IP, with a 15-minute lockout.
- **Stable Row IDs:** Rows are identified by the ID column (G), not row number. This prevents data corruption if rows are inserted/deleted.

### Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Deploy on Vercel

1. Push your code to GitHub
2. Import the project on [Vercel](https://vercel.com)
3. Add environment variables in Vercel project settings:
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `GOOGLE_PRIVATE_KEY`
   - `GOOGLE_SHEET_ID`
   - `ACCESS_CODES` (recommended) or `ADMIN_ACCESS_CODE`
4. Deploy!

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Maps:** OpenStreetMap (via react-leaflet) - Free, no API key required
- **Backend:** Google Sheets API

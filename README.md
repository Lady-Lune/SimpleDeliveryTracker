# Delivery Coordinator

A mobile-friendly web application to coordinate food parcel deliveries from a central point to scattered recipients. Uses a Google Sheet as the backend database and displays recipients as interactive pins on a map.

## Features

- 🗺️ Interactive OpenStreetMap interface (free, no API key required)
- 📍 Color-coded markers (Red: Pending, Yellow: In Progress, Green: Delivered)
- 📱 Mobile-friendly responsive design
- 🔐 Simple shared password authentication
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
     - A: `Google Map Link` (URL with coordinates)
     - B: `Recipient Type` (e.g., "Girls", "Boys")
     - C: `Parcels` (Number)
     - D: `Faculty` (e.g., "Computing")
     - E: `Phone` (Phone number)
     - F: `Status` ("Pending", "On the way", or "Delivered")
   - Share the sheet with your Service Account email (Editor access)

### Environment Setup

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

Required variables:
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` - Your service account email
- `GOOGLE_PRIVATE_KEY` - Private key from the JSON file (keep the \n characters)
- `GOOGLE_SHEET_ID` - The ID from your Google Sheet URL
- `ADMIN_ACCESS_CODE` - A shared password for deliverers

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
   - `ADMIN_ACCESS_CODE`
4. Deploy!

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Maps:** OpenStreetMap (via react-leaflet) - Free, no API key required
- **Backend:** Google Sheets API

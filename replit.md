# GeoMaster (جيو ماستر)

## Overview
A React + Vite frontend application for geographic search and translation using Google's Gemini AI. The app allows users to ask geographical questions and translate geographic terms between English and Arabic.

## Tech Stack
- **Frontend**: React 19, TypeScript, Tailwind CSS v4
- **Build Tool**: Vite 6
- **AI**: Google Gemini API (`@google/genai`)
- **UI Libraries**: lucide-react, react-markdown, motion

## Project Structure
```
├── src/
│   ├── App.tsx       # Main application component
│   ├── main.tsx      # React entry point
│   └── index.css     # Global styles
├── index.html         # HTML entry point
├── vite.config.ts     # Vite configuration (port 5000, host 0.0.0.0)
├── package.json
└── tsconfig.json
```

## Environment Variables
- `GEMINI_API_KEY` - Required for Gemini AI API calls

## Running the App

### Frontend (dev)
```bash
npm run dev
```
Runs on `http://0.0.0.0:5000`

### Backend API (dev)
```bash
npm run start:dev
```
Runs on `http://localhost:3001`

### Production (serves both API + built frontend)
```bash
npm run build && npm start
```
Runs on `http://0.0.0.0:PORT`

## API Endpoints
- `GET /api/status` → `{ "status": "running" }`
- `GET /api/health` → `{ "status": "ok", "uptime": ..., "timestamp": ... }`

## Features
- **Geographic Search**: Ask questions about geography, answered using Gemini AI with Google Search grounding
- **Geographic Translator**: Translate geographic terms between English and Arabic with scientific accuracy
- RTL (right-to-left) layout for Arabic support
- File upload support (images and documents)
- Multi-model selection (Gemini 3.1 Pro, Gemini 3 Flash, Gemini 3.1 Flash Lite)
- Source citations from web search

## Deployment
Configured as a static site deployment:
- Build command: `npm run build`
- Output directory: `dist`

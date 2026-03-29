# GeoMaster (جيو ماستر)

## Overview
A React + Vite frontend application for geographic search and translation using Hugging Face Inference API. The app allows users to ask geographical questions and translate geographic terms between English and Arabic.

## Tech Stack
- **Frontend**: React 19, TypeScript, Tailwind CSS v4
- **Build Tool**: Vite 6
- **Backend**: Express.js (Node.js)
- **AI**: Hugging Face Inference API (chatCompletion)
- **OCR**: Tesseract.js (English + Arabic text extraction from images)
- **UI Libraries**: lucide-react, react-markdown, motion

## Project Structure
```
├── src/
│   ├── App.tsx       # Main application component
│   ├── main.tsx      # React entry point
│   └── index.css     # Global styles
├── routes/
│   └── api.js        # Express API routes (chat, alternatives)
├── server.js          # Express server entry point
├── index.html         # HTML entry point
├── vite.config.ts     # Vite configuration (port 5000, host 0.0.0.0)
├── package.json
└── tsconfig.json
```

## Environment Variables
- `HUGGINGFACE_API_TOKEN` - Hugging Face API token for inference

## Available Models
- `mistralai/Mistral-7B-Instruct-v0.2` - Fast (default)
- `Qwen/Qwen2.5-7B-Instruct` - Balanced
- `meta-llama/Llama-3.1-8B-Instruct` - Smart

All models use `hf.chatCompletion()` API. Falcon 7B and Llama 2 are NOT supported (no inference provider). NLLB models also have no provider.

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
- `POST /api/chat` → AI-powered geographic search or translation
- `POST /api/alternatives` → Alternative meanings/translations

## Features
- **Geographic Search**: Ask questions about geography in Arabic
- **Geographic Translator**: Translate geographic terms between English and Arabic with scientific accuracy
- **OCR Support**: Extract text from uploaded images (English + Arabic) via Tesseract.js
- RTL (right-to-left) layout for Arabic support
- File upload support (images)
- Multi-model selection
- Fallback model support if primary model fails

## Deployment
Configured as autoscale deployment:
- Build command: `npm run build`
- Run command: `node server.js`
- Express serves both API endpoints and built static frontend

## Architecture Notes
- HMR is disabled (`hmr: false`) because it fails through Replit's proxy
- Vite ignores `.local/**`, `.cache/**`, `node_modules/**` to prevent reload loops
- Server.js body limit set to 50mb to handle file uploads
- Vite proxies `/api/*` to `http://localhost:3001` in development
- All AI calls go through the backend - no API keys exposed to frontend
- Uses `hf.chatCompletion()` - NOT `hf.conversational()` (deprecated/removed in v4)

# GeoMaster (جيو ماستر)

## Overview
A React + Vite frontend application for geographic search and translation using Hugging Face Inference API. The app allows users to ask geographical questions and translate geographic terms between English and Arabic.

## Tech Stack
- **Frontend**: React 19, TypeScript, Tailwind CSS v4
- **Build Tool**: Vite 6
- **Backend**: Express.js (Node.js)
- **AI**: Hugging Face Inference API (chatCompletion)
- **Image Understanding**: Gemini 2.5 Flash via Replit AI Integrations (vision-based text extraction from images)
- **PDF Parsing**: pdf-parse v2 (PDFParse class API)
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
- `AI_INTEGRATIONS_GEMINI_API_KEY` - Auto-configured by Replit AI Integrations (do NOT modify)
- `AI_INTEGRATIONS_GEMINI_BASE_URL` - Auto-configured by Replit AI Integrations (do NOT modify)

## Available Models
- `Qwen/Qwen2.5-72B-Instruct` - Most accurate (default)
- `meta-llama/Llama-3.3-70B-Instruct` - Fast and smart
- `mistralai/Mistral-7B-Instruct-v0.2` - Lightweight

All models use `hf.chatCompletion()` API. Falcon 7B, Llama 2, and NLLB models have no inference provider - do NOT use them.

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
- **Image Understanding**: Extract text from uploaded images using Gemini Vision AI (replaces Tesseract.js OCR for much better accuracy)
- **PDF Support**: Extract text from uploaded PDF files via pdf-parse v2 (PDFParse class: load → getText → destroy)
- RTL (right-to-left) layout for Arabic support
- File upload support (images + PDFs)
- Multi-model selection
- Fallback model support if primary model fails
- **Video Background**: Animated sea waves background (`/sea-waves-bg.mp4`) with poster fallback (`/sea-waves-poster.jpg`)
- **3D Glassmorphism Message Bubbles**: Messages have gradient backgrounds, backdrop blur, inset highlights, and CSS pseudo-element shine effects (`msg-bubble-user` / `msg-bubble-ai` classes in index.css)
- **Reduced Motion Support**: Falls back to static poster image when `prefers-reduced-motion` is enabled

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
- Image text extraction uses Gemini Vision (GoogleGenAI from @google/genai) with inline base64 data
- PDF parsing uses PDFParse class API (pdf-parse v2): constructor → load(buffer) → getText() → destroy() with proper cleanup in finally block

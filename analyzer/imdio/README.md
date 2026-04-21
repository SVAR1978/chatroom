# imdio Audio Compressor

Simple browser-based audio compression app.

## What It Does

- Upload one audio file (mp3, wav, ogg, webm, aac, flac)
- Validate extension, MIME type, and audio header server-side
- Sanitize file names (max 128 chars)
- Compress audio to MP3 with selectable bitrate
- Show upload progress (percent, speed in KB/s, ETA)
- Download compressed audio file

## Project Structure

- src/services/compress.service.js
- src/services/validate.js
- src/routes/upload.routes.js
- src/app.js
- public/index.html
- public/app.js

## Environment

Copy `.env.example` to `.env`:

- `PORT` server port
- `MAX_FILE_SIZE_MB` max upload size (default 500)
- `TEMP_DIR` temp directory for incoming/compressed files
- `CLEANUP_AFTER_MINUTES` auto cleanup interval for temp files

## Run

1. `npm install`
2. `npm start`
3. Open `http://localhost:8080`

## API

- `POST /api/compress` (form-data: `audio`, optional `profile`, optional `customBitrateKbps`)
- `GET /api/compress/:jobId/download`

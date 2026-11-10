# DukaanVoice AI (दुकान आवाज)

**Your Shop. Your Language. Your Voice.**

## About the Project

DukaanVoice AI is a multilingual, voice-first shop management web application built for small Indian *kirana* and retail shopkeepers. It allows store owners to manage inventory, record sales, track customer credit (*Digital Khata*), and review store performance through natural voice commands or standard forms in **Hindi**, **Hinglish**, **Kannada**, and **English** (with **English**, **Hindi**, and **Kannada** UI translations).

## Key Features

- **Dashboard:** Displays today's revenue, bill count, total products, low-stock count, pending khata credit, a 7-day sales revenue chart, low-stock alerts, top-selling items, and recent transactions with a printable receipt modal (`window.print()`).
- **Voice Assistant:** Records voice commands from the browser microphone (converted client-side to 16 kHz mono WAV) or accepts typed commands, transcribes speech, extracts structured actions via AI, lets the shopkeeper review or manually edit all fields before saving, confirms execution with spoken audio, and supports switching between saved default and temporary voice languages.
- **Inventory:** Supports adding, viewing, editing, and deleting products, quick `+5` / `-1` stock adjustments, search, category and stock-status filters (`In Stock`, `Low Stock`, `Out of Stock`), and low-stock threshold alerts.
- **Sales History:** Lists shop sales with date-range and payment-method (`Cash`, `UPI`, `Khata`) filters, page summary metrics, a printable invoice modal, and a WhatsApp text share link (`wa.me`).
- **Digital Khata:** Manages customer credit profiles, records credit (*udhaar*) and payment (*jama*) entries with confirmation prompts and running balances, opens pre-filled WhatsApp reminder links (`wa.me`) for pending dues, and prints customer statements (`window.print()`).
- **AI Insights:** Computes store metrics (today/weekly/monthly revenue, 7-day trend, category share, best sellers, slow-moving products, recent stock changes) and generates a Gemini summary, basic action recommendations, and narrated audio via Gnani Timbre when store data exists.
- **Settings:** Allows updating store profile details (shop name, owner name, phone, GSTIN, address), changing the UI display language (`en`, `hi`, `kn`), updating the account's primary voice dialect (`hi`, `hinglish`, `kn`, `en`), and logging out.

## How It Works

1. **Voice Capture:** The browser records microphone audio (`MediaRecorder`), converts it client-side to 16 kHz mono WAV (or takes typed text), and sends it to `POST /api/voice/process`.
2. **Speech-to-Text:** The Express backend forwards supported audio formats (`WAV`, `MP3`, `M4A`, `OGG`, `FLAC`, `AAC`) to **Gnani Prisma v2.5** (`https://api.vachana.ai/stt/v3`) using the selected language code (`hi-IN`, `indic-auto`, `kn-IN`, or `en-IN`).
3. **Command Understanding:** **Google Gemini** (`@google/genai`) parses the transcript against the shop's current product and customer lists into a structured action (`RECORD_SALE`, `ADD_STOCK`, `ADD_PRODUCT`, `REMOVE_STOCK`, `ADD_CUSTOMER`, `RECORD_CREDIT`, `RECORD_PAYMENT`, or stock/credit queries). Incomplete commands return a clarification prompt.
4. **Review and Manual Edit:** The frontend displays the transcript, AI interpretation, and an inline editable form pre-filled with the extracted entities so the shopkeeper can correct the action, product, quantity, unit, price, customer, or payment method before confirming.
5. **Save and Spoken Confirmation:** On confirmation (`POST /api/voice/execute`), the backend validates stock and inputs, writes shop-scoped updates to **MongoDB** (with conditional stock checks and `idempotencyKey` duplicate protection), and returns a spoken confirmation from **Gnani Timbre v2.5** (falling back to text and browser `speechSynthesis` if TTS is unavailable).

## Technology Stack

- **Frontend:** React 18, Vite, Tailwind CSS, React Router, Recharts, Lucide React, Axios
- **Backend:** Node.js, Express.js, Mongoose, JWT (`bcryptjs`, HTTP-only cookie `dvai.token`), `express-validator`, `express-rate-limit`
- **Database:** MongoDB
- **AI & Speech:** Gnani Prisma v2.5 (STT), Gnani Timbre v2.5 (TTS), Google Gemini (`@google/genai`)

## Gnani AI Integration

- **Gnani Prisma v2.5 (Speech-to-Text):** Called via `https://api.vachana.ai/stt/v3` (`model: prisma-v2.5`) to transcribe spoken shop commands. Maps Hindi to `hi-IN`, Hinglish to `indic-auto` (`multi_lang_codes: hi-IN,en-IN`), Kannada to `kn-IN`, and English to `en-IN`, with automatic retries on transient `429` and `5xx` errors.
- **Gnani Timbre v2.5 (Text-to-Speech):** Called via `https://api.vachana.ai/api/v1/tts/inference` (`model: timbre-v2.5`, 24 kHz linear PCM WAV) to generate voice confirmations in the Voice Assistant and spoken store summaries in AI Insights (`hi-IN`, `kn-IN`, `en-IN`). If the TTS service fails, database operations still succeed and the UI falls back to text and browser speech synthesis.

## Project Solution Pitch

Read the one-page solution pitch for **DukaanVoice AI**: [Solution Pitch](docs/SOLUTION_PITCH.md)

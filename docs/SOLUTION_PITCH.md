# DukaanVoice AI
### Your Shop. Your Language. Your Voice.

**Project:** DukaanVoice AI | **Category:** Voice-first AI for Indian Retail | **Technology:** React, Node.js, Express.js, MongoDB, Gnani AI

---

## The Problem

Millions of small Indian kirana shopkeepers manage their inventory, daily sales and customer credit manually. Maintaining records takes time, updating stock is inconvenient, and many existing digital tools are difficult to use for shopkeepers who are more comfortable speaking in their native language than typing.

## Our Solution

DukaanVoice AI is a multilingual, voice-first application designed to simplify everyday shop management. It allows kirana shopkeepers to manage inventory, record sales and maintain customer credit using natural voice commands in Hindi, Hinglish and Kannada.

Instead of navigating multiple forms, shopkeepers can simply speak commands such as:

- "10 kilo atta stock mein add kar do."
- "Aaj 2 Maggi packets bech diye."
- "Harsh ke khate mein 400 rupaye udhaar add karo."
- "Maggi ka kitna stock bacha hai?"

The application converts these commands into structured operations that the shopkeeper can review, edit and confirm before saving.

## Key Features

- **Dashboard:** Overview of shop activity and business performance.
- **Voice Assistant:** Manage shop operations using natural language.
- **Inventory:** Add products, update stock and remove stock.
- **Sales History:** Maintain records of completed sales.
- **Digital Khata:** Manage customers, credit and payment records.
- **AI Insights:** Understand business activity through stored data.
- **Settings:** Manage shop and language preferences.

## How Gnani AI Powers the Project

Gnani AI plays an important role in the voice interaction pipeline:

1. **Gnani Prisma v2.5 (Speech-to-Text):** Converts the shopkeeper's spoken commands into text.
2. **LLM-based Command Understanding:** Interprets the transcribed text to identify the requested action, product, quantity and other relevant details.
3. **MongoDB:** Stores and updates the shop's inventory, sales and customer records after the shopkeeper confirms the operation.
4. **Gnani Timbre v2.5 (Text-to-Speech):** Converts the assistant's response into speech so the shopkeeper can interact naturally.

The shopkeeper can also manually edit the interpreted details before confirming an operation.

## Technology Stack

- **Frontend:** React, Vite, Tailwind CSS
- **Backend:** Node.js, Express.js
- **Database:** MongoDB
- **AI:** Gnani Prisma v2.5, Gnani Timbre v2.5 and LLM-based command understanding

## Impact and Vision

DukaanVoice AI aims to make digital shop management accessible to small Indian retailers by reducing manual record-keeping and enabling interaction in familiar Indian languages.

Our long-term vision is to build a practical, affordable and multilingual digital assistant for India's small retail businesses.

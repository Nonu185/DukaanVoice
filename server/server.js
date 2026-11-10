import 'dotenv/config';
import app from './src/app.js';
import { connectDB } from './src/config/database.js';

const PORT = process.env.PORT || 5001;

// Connect to MongoDB
connectDB().catch((err) => {
  console.error('Failed to connect to MongoDB on startup:', err.message);
});

app.listen(PORT, () => {
  console.log(`DukaanVoice AI backend server running on port ${PORT}`);
});

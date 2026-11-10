import mongoose from 'mongoose';

export async function connectDB() {
  if (!process.env.MONGODB_URI) return console.warn('MONGODB_URI not set');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('MongoDB connected');
}

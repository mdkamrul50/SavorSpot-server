import express, { type Request, type Response } from 'express';
import dotenv from 'dotenv';
import { MongoClient, ServerApiVersion } from 'mongodb';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error('MONGO_URI is not defined in .env');
  process.exit(1);
}

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});


async function connectDB() {
  try {
    await client.connect();
    console.log('Connected to MongoDB successfully ✅');
    // একবার কানেক্ট হয়ে গেলে ping দেওয়া ঐচ্ছিক
    await client.db('admin').command({ ping: 1 });
    console.log('Pinged your deployment. Connection confirmed!');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
}

app.get('/', (req: Request, res: Response) => {
  res.send('Hello World! SavorSpot API is running.');
});


connectDB().then(() => {
  app.listen(port, () => {
    console.log(`Server running on http://localhost:${port} 🚀`);
  });
});

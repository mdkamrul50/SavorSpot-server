// index.ts
import express, { type Request, type Response } from 'express';
import dotenv from 'dotenv';
import cors from 'cors'; 
import {
  MongoClient,
  ServerApiVersion,
  ObjectId,
  Db,
  type Collection,
} from 'mongodb';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error('MONGODB_URI is not defined in .env');
  process.exit(1);
}

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// ────────────── Interfaces ──────────────
interface Location {
  city: string;
  area?: string;
  fullAddress?: string;
}

interface Experience {
  _id?: ObjectId;
  title: string;
  shortDescription: string;
  fullDescription: string;
  images: string[];
  pricePerPerson: number;
  currency: string;
  location: Location;
  ratingAvg: number;
  reviewCount: number;
  duration: number;
  maxGroupSize: number;
  category: string;
  host?: ObjectId;
  status?: 'pending' | 'approved' | 'rejected';
  createdAt?: Date;
}

interface QueryParams {
  search?: string;
  category?: string;
  minPrice?: string;
  maxPrice?: string;
  minRating?: string;
  sort?: string;
  page?: string;
  limit?: string;
}

// ────────────── DB Connect ──────────────
async function connectDB() {
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    app.locals.db = client.db('SavorSpot');
    await client.db('admin').command({ ping: 1 });
    console.log('✅ Ping successful');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  }
}

app.use(cors());   
app.use(express.json());

// ────────────── Helper: get collection ──────────────
function getCollection(): Collection<Experience> {
  const db = app.locals.db as Db;
  return db.collection<Experience>('experiences');
}
// Alternatively, we can directly assign with type assertion inside routes, but the function is cleaner.

// ────────────── GET /api/experiences ──────────────
app.get(
  '/api/experiences',
  async (req: Request<{}, {}, {}, QueryParams>, res: Response) => {
    try {
      const collection = getCollection();

      const {
        search,
        category,
        minPrice,
        maxPrice,
        minRating,
        sort,
        page = '1',
        limit = '8',
      } = req.query;

      const filter: any = {};

      if (search) {
        filter.$or = [
          { title: { $regex: search, $options: 'i' } },
          { 'location.city': { $regex: search, $options: 'i' } },
          { category: { $regex: search, $options: 'i' } },
        ];
      }

      if (category) filter.category = category;

      if (minPrice || maxPrice) {
        filter.pricePerPerson = {};
        if (minPrice) filter.pricePerPerson.$gte = Number(minPrice);
        if (maxPrice) filter.pricePerPerson.$lte = Number(maxPrice);
      }

      if (minRating) filter.ratingAvg = { $gte: Number(minRating) };

      let sortQuery: any = { createdAt: -1 };
      if (sort === 'price-low') sortQuery = { pricePerPerson: 1 };
      else if (sort === 'price-high') sortQuery = { pricePerPerson: -1 };
      else if (sort === 'rating') sortQuery = { ratingAvg: -1 };

      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      const [experiences, total] = await Promise.all([
        collection
          .find(filter)
          .sort(sortQuery)
          .skip(skip)
          .limit(limitNum)
          .toArray(),
        collection.countDocuments(filter),
      ]);

      res.json({
        experiences,
        pagination: {
          total,
          page: pageNum,
          pages: Math.ceil(total / limitNum),
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ────────────── GET /api/experiences/:id ──────────────
app.get(
  '/api/experiences/:id',
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      const collection = getCollection();
      const { id } = req.params;

      if (!ObjectId.isValid(id))
        return res.status(400).json({ error: 'Invalid ID' });

      const experience = await collection.findOne({ _id: new ObjectId(id) });
      if (!experience) return res.status(404).json({ error: 'Not found' });

      res.json({ experience });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ────────────── POST /api/experiences ──────────────
app.post('/api/experiences', async (req: Request, res: Response) => {
  try {
    const collection = getCollection();
    const newExp: Experience = {
      ...req.body,
      ratingAvg: 0,
      reviewCount: 0,
      status: 'pending',
      createdAt: new Date(),
    };

    const result = await collection.insertOne(newExp);
    res.status(201).json({ experience: { ...newExp, _id: result.insertedId } });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ────────────── PUT /api/experiences/:id ──────────────
app.put(
  '/api/experiences/:id',
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      const collection = getCollection();
      const { id } = req.params;

      if (!ObjectId.isValid(id))
        return res.status(400).json({ error: 'Invalid ID' });

      const updated = await collection.findOneAndUpdate(
        { _id: new ObjectId(id) },
        { $set: req.body },
        { returnDocument: 'after' }
      );

      if (!updated) return res.status(404).json({ error: 'Not found' });

      res.json({ experience: updated });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
);

// ────────────── DELETE /api/experiences/:id ──────────────
app.delete(
  '/api/experiences/:id',
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      const collection = getCollection();
      const { id } = req.params;

      if (!ObjectId.isValid(id))
        return res.status(400).json({ error: 'Invalid ID' });

      const result = await collection.deleteOne({ _id: new ObjectId(id) });
      if (result.deletedCount === 0)
        return res.status(404).json({ error: 'Not found' });

      res.json({ message: 'Deleted successfully' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ────────────── Root ──────────────
app.get('/', (req: Request, res: Response) => {
  res.send('SavorSpot API is running. Access /api/experiences');
});

// ────────────── Start Server ──────────────
connectDB().then(() => {
  app.listen(port, () => {
    console.log(`🚀 Server running on http://localhost:${port}`);
  });
});

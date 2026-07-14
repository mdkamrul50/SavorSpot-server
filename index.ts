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

// ────────────── Interfaces ───────────
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
  host?: ObjectId | string; 
  status?: 'pending' | 'approved' | 'rejected';
  createdAt?: Date;
}

interface User {
  _id?: ObjectId;
  name: string;
  email: string;
  password?: string;
  role?: 'user' | 'host' | 'admin';
  avatar?: string;
  bio?: string;
  location?: string;
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

// ────────────── Helper: get collections ──────────────
function getExperienceCollection(): Collection<Experience> {
  const db = app.locals.db as Db;
  return db.collection<Experience>('experiences');
}

function getUserCollection(): Collection<User> {
  const db = app.locals.db as Db;
  return db.collection<User>('users');
}

// ────────────── GET /api/experiences (public) ──────────────
app.get(
  '/api/experiences',
  async (req: Request<{}, {}, {}, QueryParams>, res: Response) => {
    try {
      const collection = getExperienceCollection();

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

// ────────────── GET /api/experiences/my 
app.get('/api/experiences/my', async (req: Request, res: Response) => {
  try {
    const collection = getExperienceCollection();
    const { userId } = req.query;

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'userId query param is required' });
    }

    let filter: any = {};
    if (ObjectId.isValid(userId)) {
      filter.host = new ObjectId(userId);
    } else {
      filter.host = userId;
    }

    const experiences = await collection
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();
    res.json({ experiences });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ────────────── GET /api/experiences/:id (public) ──────────────
app.get(
  '/api/experiences/:id',
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      const collection = getExperienceCollection();
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

// ────────────── POST /api/experiences 
app.post('/api/experiences', async (req: Request, res: Response) => {
  try {
    const collection = getExperienceCollection();
    const { userId, ...rest } = req.body; 
    const newExp: Experience = {
      ...rest,
      host: userId ? new ObjectId(userId) : undefined, 
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
      const collection = getExperienceCollection();
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

// ────────────── DELETE /api/experiences/:id 
app.delete(
  '/api/experiences/:id',
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      const collection = getExperienceCollection();
      const { id } = req.params;
      const { userId } = req.query;

      if (!userId || typeof userId !== 'string') {
        return res
          .status(400)
          .json({ error: 'userId query param is required' });
      }

      if (!ObjectId.isValid(id))
        return res.status(400).json({ error: 'Invalid ID' });

     
      const experience = await collection.findOne({ _id: new ObjectId(id) });
      if (!experience) return res.status(404).json({ error: 'Not found' });

  
      const hostId = experience.host?.toString();
      if (hostId !== userId) {
        return res
          .status(403)
          .json({ error: 'You can only delete your own experiences' });
      }

      const result = await collection.deleteOne({ _id: new ObjectId(id) });
      if (result.deletedCount === 0)
        return res.status(404).json({ error: 'Not found' });

      res.json({ message: 'Deleted successfully' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ────────────── USER ROUTES ──────────────
// GET /api/users/:id
app.get(
  '/api/users/:id',
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      const users = getUserCollection();
      const { id } = req.params;

      let user = null;
      if (ObjectId.isValid(id)) {
        user = await users.findOne({ _id: new ObjectId(id) });
      }
      if (!user) {
        user = await users.findOne({ _id: id } as any);
      }

      if (!user) return res.status(404).json({ error: 'User not found' });

      const { password, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// PUT /api/users/:id
app.put(
  '/api/users/:id',
  async (req: Request<{ id: string }>, res: Response) => {
    try {
      const users = getUserCollection();
      const { id } = req.params;
      const { name, location, bio } = req.body;
      const update: any = {};
      if (name) update.name = name;
      if (location !== undefined) update.location = location;
      if (bio !== undefined) update.bio = bio;

      let result = null;
      if (ObjectId.isValid(id)) {
        result = await users.findOneAndUpdate(
          { _id: new ObjectId(id) },
          { $set: update },
          { returnDocument: 'after', projection: { password: 0 } }
        );
      }
      if (!result) {
        result = await users.findOneAndUpdate(
          { _id: id } as any,
          { $set: update },
          { returnDocument: 'after', projection: { password: 0 } }
        );
      }

      if (!result) return res.status(404).json({ error: 'User not found' });
      res.json({ user: result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
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

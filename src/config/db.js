import { MongoClient } from "mongodb";
import { env } from "./env.js";

let cachedClient = null;
let cachedDb = null;

export async function connectDB() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  if (!env.DB_URI) {
    throw new Error("DB_URI is missing in .env");
  }

  const client = new MongoClient(env.DB_URI);
  await client.connect();
  const db = client.db(env.DB_NAME);

  await Promise.all([
    db.collection("users").createIndex({ email: 1 }, { unique: true }),
    db.collection("tuitions").createIndex({ approvalStatus: 1, isActive: 1, createdAt: -1 }),
    db.collection("tuitions").createIndex({ tutorEmail: 1 }),
    db.collection("applications").createIndex({ tuitionId: 1, studentEmail: 1 }, { unique: true }),
    db.collection("payments").createIndex({ stripeSessionId: 1 }, { unique: true, sparse: true }),
  ]).catch(() => {});

  cachedClient = client;
  cachedDb = db;
  return { client, db };
}

export function getCollections(db) {
  return {
    users: db.collection("users"),
    tuitions: db.collection("tuitions"),
    applications: db.collection("applications"),
    payments: db.collection("payments"),
  };
}

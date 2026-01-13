const redis = require("redis");

const client = redis.createClient({
  url: process.env.REDIS_URL,
});

client.on("connect", () => {
  console.log("✅ Redis connected");
});

client.on("error", (err) => {
  console.error("❌ Redis Error:", err);
});

async function connectRedis() {
  if (!client.isOpen) {
    await client.connect();
  }
}

async function cache(key, fetchFunction, ttl = 60) {
  const cachedData = await client.get(key);
  if (cachedData) return JSON.parse(cachedData);

  const data = await fetchFunction();
  await client.set(key, JSON.stringify(data), { EX: ttl });
  return data;
}

module.exports = {
  client,
  connectRedis,
  cache,
};

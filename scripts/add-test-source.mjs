// Adds The Manufacturer's website as a watched source (idempotent) and prints its id
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const existing = await db.watchedSource.findFirst({
  where: { url: "https://www.themanufacturer.com" },
});

const source =
  existing ??
  (await db.watchedSource.create({
    data: {
      name: "The Manufacturer",
      type: "WEBSITE",
      url: "https://www.themanufacturer.com",
    },
  }));

console.log(source.id);
await db.$disconnect();

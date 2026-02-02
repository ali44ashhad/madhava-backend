// Prisma 7+ migration configuration
// Connection URL for migrations is configured here instead of schema.prisma
export default {
  datasource: {
    url: process.env.DATABASE_URL,
  },
};


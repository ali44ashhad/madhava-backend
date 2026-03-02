import { PrismaClient } from '@prisma/client';
import { getAllSkus } from './src/services/sku.service.js';

const prisma = new PrismaClient();

async function run() {
    console.log("--- TEST IN STOCK ---");
    const inStock = await getAllSkus(1, 2, undefined, 'in_stock');
    console.dir(inStock.pagination, { depth: null });

    console.log("--- TEST LOW STOCK ---");
    const lowStock = await getAllSkus(1, 2, undefined, 'low');
    console.dir(lowStock.pagination, { depth: null });

    console.log("--- TEST OUT OF STOCK ---");
    const outOfStock = await getAllSkus(1, 2, undefined, 'out_of_stock');
    console.dir(outOfStock.pagination, { depth: null });
}

run()
    .catch(console.error)
    .finally(() => prisma.$disconnect());

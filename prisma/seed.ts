import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

const CATEGORIES = [
    {
        name: 'Krishna Items',
        slug: 'krishna-items',
        keyword: 'krishna',
        subs: [
            { name: 'Krishna Idols', slug: 'krishna-idols', keyword: 'krishna,idol' },
            { name: 'Krishna Idol Clothes', slug: 'krishna-idol-clothes', keyword: 'krishna,poshaak' },
            { name: 'Krishna Accessories', slug: 'krishna-accessories', keyword: 'flute,mukut' },
        ],
    },
    {
        name: 'Rama & Sita Items',
        slug: 'rama-sita-items',
        keyword: 'rama,sita',
        subs: [
            { name: 'Rama Darbar Idols', slug: 'rama-darbar-idols', keyword: 'rama,darbar' },
            { name: 'Frames & Paintings', slug: 'rama-frames-paintings', keyword: 'ramayana,painting' },
        ],
    },
    {
        name: 'Shiva Items',
        slug: 'shiva-items',
        keyword: 'shiva',
        subs: [
            { name: 'Shiva Lingams', slug: 'shiva-lingams', keyword: 'shivalingam' },
            { name: 'Shiva Idols', slug: 'shiva-idols', keyword: 'shiva,idol' },
            { name: 'Bhasma & Vibhuti', slug: 'bhasma-vibhuti', keyword: 'vibhuti,ash' },
        ],
    },
    {
        name: 'Ganesha & Hanuman',
        slug: 'ganesha-hanuman',
        keyword: 'ganesha,hanuman',
        subs: [
            { name: 'Ganesha Idols', slug: 'ganesha-idols', keyword: 'ganesha,idol' },
            { name: 'Hanuman Idols', slug: 'hanuman-idols', keyword: 'hanuman,idol' },
            { name: 'Ganesha Car Dashboards', slug: 'ganesha-car-dashboard', keyword: 'ganesha,dashboard' },
        ],
    },
    {
        name: 'Goddess Items',
        slug: 'goddess-items',
        keyword: 'durga,kali',
        subs: [
            { name: 'Durga Mata Idols', slug: 'durga-mata-idols', keyword: 'durga,idol' },
            { name: 'Lakshmi Mata Idols', slug: 'lakshmi-mata-idols', keyword: 'lakshmi,idol' },
            { name: 'Saraswati Mata Idols', slug: 'saraswati-mata-idols', keyword: 'saraswati,idol' },
        ],
    },
    {
        name: 'Pooja Essentials',
        slug: 'pooja-essentials',
        keyword: 'pooja,thali',
        subs: [
            { name: 'Pooja Thalis', slug: 'pooja-thalis', keyword: 'pooja,thali' },
            { name: 'Incense Sticks & Dhoop', slug: 'incense-sticks-dhoop', keyword: 'agarbatti,incense' },
            { name: 'Diyas & Lamps', slug: 'diyas-lamps', keyword: 'diya,lamp' },
        ],
    },
    {
        name: 'Spiritual Books',
        slug: 'spiritual-books',
        keyword: 'bhagavadgita,book',
        subs: [
            { name: 'Bhagavad Gita', slug: 'bhagavad-gita', keyword: 'bhagavadgita' },
            { name: 'Ramayana & Mahabharata', slug: 'ramayana-mahabharata', keyword: 'ramayana' },
            { name: 'Aartis & Chalisa', slug: 'aartis-chalisa', keyword: 'hanumanchalisa' },
        ],
    },
    {
        name: 'Yantras & Gemstones',
        slug: 'yantras-gemstones',
        keyword: 'yantra,gemstone',
        subs: [
            { name: 'Copper Yantras', slug: 'copper-yantras', keyword: 'yantra,copper' },
            { name: 'Navagraha Items', slug: 'navagraha-items', keyword: 'navagraha' },
        ],
    },
    {
        name: 'Temple & Home Decor',
        slug: 'temple-home-decor',
        keyword: 'temple,decor',
        subs: [
            { name: 'Wooden Temples', slug: 'wooden-temples', keyword: 'woodentemple' },
            { name: 'Torans & Hangings', slug: 'torans-hangings', keyword: 'toran,decor' },
            { name: 'Bells & Shankh', slug: 'bells-shankh', keyword: 'temple,bell' },
        ],
    },
    {
        name: 'Rudraksha & Malas',
        slug: 'rudraksha-malas',
        keyword: 'rudraksha,mala',
        subs: [
            { name: 'Rudraksha Beads', slug: 'rudraksha-beads', keyword: 'rudraksha' },
            { name: 'Tulsi Malas', slug: 'tulsi-malas', keyword: 'tulsi,mala' },
            { name: 'Crystal & Lotus Malas', slug: 'crystal-lotus-malas', keyword: 'crystal,mala' },
        ],
    },
];

// Helper to generate image URL
const getImageUrl = (keyword: string) => `https://loremflickr.com/600/600/${encodeURIComponent(keyword)}`;

const generateSkuCode = (prefix: string, index: number) => {
    return `${prefix}-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${index}`;
};

const DUMMY_SELLERS = [
    {
        sellerName: 'Madhava Spiritual Store',
        sellerAddress: '108, Prem Mandir Road, Vrindavan',
        sellerPincode: '281121',
        manufacturerName: 'Vrindavan Handlooms & Crafts',
        manufacturerAddress: 'Mathura, UP',
        countryOfOrigin: 'India',
    },
    {
        sellerName: 'Kashi Vishwanath Traders',
        sellerAddress: 'Dashashwamedh Ghat, Varanasi',
        sellerPincode: '221001',
        manufacturerName: 'Kashi Murti Bhandar',
        manufacturerAddress: 'Varanasi, UP',
        countryOfOrigin: 'India',
    },
];

async function main() {
    console.log('Starting seed process...');

    // Optional: Warning: This deletes existing product catalog data!
    console.log('Cleaning existing product data...');
    await prisma.cartItem.deleteMany();
    await prisma.orderItem.deleteMany();
    await prisma.skuImage.deleteMany();
    await prisma.sku.deleteMany();
    await prisma.productImage.deleteMany();
    await prisma.product.deleteMany();
    await prisma.subcategory.deleteMany();
    await prisma.category.deleteMany();

    let skuCount = 0;
    let productCount = 0;

    console.log('Inserting Categories, Subcategories, Products, and SKUs...');

    for (const catData of CATEGORIES) {
        // Recreate category
        const category = await prisma.category.create({
            data: {
                name: catData.name,
                slug: catData.slug,
                imageUrl: getImageUrl(catData.keyword),
            },
        });

        for (const subData of catData.subs) {
            const subcategory = await prisma.subcategory.create({
                data: {
                    name: subData.name,
                    slug: subData.slug,
                    imageUrl: getImageUrl(subData.keyword),
                    categoryId: category.id,
                },
            });

            // Let's create 1-2 products per subcategory to get ~30 products total (10*2.8 = 28 subs, so 1 product per sub gives ~28 products)
            const isClothing = subData.name.includes('Clothes') || subData.name.includes('Poshaak');
            const isIdol = subData.name.includes('Idol') || subData.name.includes('Lingam');

            let productName = `Premium ${subData.name.replace(/([sS])$/, '')}`;
            // Replace plural 's' at end to make singular product name usually
            if (subData.name === 'Bhagavad Gita' || subData.name === 'Ramayana & Mahabharata') {
                productName = `Authentic ${subData.name} Edition`;
            }

            const product = await prisma.product.create({
                data: {
                    name: productName,
                    description: `This high-quality ${productName} brings divine blessings to your home. Expertly crafted with devotion, ideal for worship and temple decoration.`,
                    categoryId: category.id,
                    subcategoryId: subcategory.id,
                    isFeatured: Math.random() > 0.7,
                    images: {
                        create: [
                            { imageUrl: getImageUrl(subData.keyword), sortOrder: 0 },
                            { imageUrl: getImageUrl(subData.keyword + ',angle'), sortOrder: 1 }
                        ]
                    }
                },
            });

            productCount++;

            // Create SKUs for the product
            const skusData = [];
            const seller = DUMMY_SELLERS[productCount % DUMMY_SELLERS.length];

            if (isClothing) {
                // Clothing variations
                const colors = ['Red', 'Yellow', 'Saffron'];
                const sizes = ['Small (0 No.)', 'Medium (2 No.)'];
                for (let i = 0; i < 2; i++) {
                    const color = colors[i % colors.length];
                    const size = sizes[i % sizes.length];
                    skusData.push({
                        size,
                        color,
                        material: 'Cotton Silk',
                        basePrice: 250 + (i * 50),
                    });
                }
            } else if (isIdol) {
                // Idol variations
                skusData.push({ size: '6 Inches', weight: '500g', material: 'Brass', basePrice: 800 });
                skusData.push({ size: '12 Inches', weight: '1.2kg', material: 'Brass', basePrice: 1500 });
            } else {
                // Generic variations
                skusData.push({ size: 'Standard', weight: '200g', material: 'Mixed', basePrice: 300 });
                if (Math.random() > 0.5) {
                    skusData.push({ size: 'Large', weight: '400g', material: 'Premium', basePrice: 500 });
                }
            }

            for (let i = 0; i < skusData.length; i++) {
                const variation = skusData[i];
                const sellingPrice = new Decimal(variation.basePrice);
                const mrp = new Decimal(variation.basePrice * 1.5); // 50% markup for MRP

                await prisma.sku.create({
                    data: {
                        skuCode: generateSkuCode(product.name.substring(0, 3).toUpperCase(), skuCount),
                        productId: product.id,
                        size: variation.size,
                        color: variation.color,
                        weight: variation.weight,
                        material: variation.material,
                        mrp: mrp,
                        sellingPrice: sellingPrice,
                        gstPercent: new Decimal(18),
                        stockQuantity: Math.floor(Math.random() * 50) + 10, // 10 to 60
                        ...seller,
                        images: {
                            create: [
                                { imageUrl: getImageUrl(subData.keyword + ',' + (variation.color || 'variation')), sortOrder: 0 }
                            ]
                        }
                    },
                });
                skuCount++;
            }
        }
    }

    console.log(`\n✅ Seed completed successfully!`);
    console.log(`Created:`);
    console.log(`- ${CATEGORIES.length} Categories`);
    console.log(`- ${CATEGORIES.reduce((acc, cat) => acc + cat.subs.length, 0)} Subcategories`);
    console.log(`- ${productCount} Products`);
    console.log(`- ${skuCount} SKUs`);
}

main()
    .catch((e) => {
        console.error('Error during seeding:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });

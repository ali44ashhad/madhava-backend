async function run() {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  
  // Create a token for an admin
  const admin = await prisma.admin.findFirst();
  if(!admin) return console.log("No admins found");
  
  const jwt = require('jsonwebtoken');
  const token = jwt.sign({ id: admin.id, email: admin.email, role: admin.role }, process.env.ADMIN_JWT_SECRET || 'wgibwofoibwfhnowi234242nhini1134df', { expiresIn: '1h' });
  
  console.log("TOKEN=" + token);
}
run();

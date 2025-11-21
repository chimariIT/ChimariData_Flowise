// Quick server health check
import 'dotenv/config';

console.log('🔍 Server Configuration Check\n');

// Check critical environment variables
const checks = [
  { name: 'PORT', value: process.env.PORT, required: false, default: '3000' },
  { name: 'DATABASE_URL', value: process.env.DATABASE_URL, required: true },
  { name: 'JWT_SECRET', value: process.env.JWT_SECRET, required: true },
  { name: 'SESSION_SECRET', value: process.env.SESSION_SECRET, required: true },
  { name: 'NODE_ENV', value: process.env.NODE_ENV, required: false, default: 'development' },
];

let hasErrors = false;

checks.forEach(check => {
  const isSet = !!check.value;
  const status = isSet ? '✅' : (check.required ? '❌' : '⚠️');

  if (check.required && !isSet) {
    hasErrors = true;
    console.log(`${status} ${check.name}: MISSING (REQUIRED)`);
  } else if (!isSet && check.default) {
    console.log(`${status} ${check.name}: Not set (will use default: ${check.default})`);
  } else if (isSet) {
    const preview = check.value.length > 30
      ? check.value.substring(0, 30) + '...'
      : check.value;
    console.log(`${status} ${check.name}: ${preview}`);
  }
});

console.log('\n🔍 Database Connection Test\n');

// Test database connection
try {
  const { db } = await import('./server/db.js');
  const { users } = await import('./shared/schema.js');

  console.log('Attempting to query database...');
  const result = await db.select().from(users).limit(1);
  console.log('✅ Database connection successful');
  console.log(`   Found ${result.length} user(s) in test query`);
} catch (error) {
  hasErrors = true;
  console.log('❌ Database connection failed:');
  console.log('   Error:', error.message);

  if (error.message.includes('connect')) {
    console.log('\n💡 Suggestion: PostgreSQL may not be running');
    console.log('   Start it with: npm run db:start (or your PostgreSQL service)');
  } else if (error.message.includes('does not exist')) {
    console.log('\n💡 Suggestion: Database or tables may not be created');
    console.log('   Run: npm run db:push');
  }
}

console.log('\n' + '='.repeat(50));

if (hasErrors) {
  console.log('\n❌ Configuration has errors. Fix the issues above before starting the server.\n');
  process.exit(1);
} else {
  console.log('\n✅ All checks passed! Server should start successfully.\n');
  process.exit(0);
}

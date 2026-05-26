import { execSync } from 'child_process';

console.log('--- Step 1: Running TypeScript Typecheck ---');
try {
  execSync('npx tsc', { stdio: 'inherit' });
  console.log('TypeScript check passed.\n');
} catch (error) {
  console.error('TypeScript compilation failed. Aborting build.');
  process.exit(1);
}

console.log('--- Step 2: Building Chrome Target ---');
try {
  process.env.VITE_BROWSER = 'chrome';
  execSync('npx vite build', { stdio: 'inherit' });
  console.log('Chrome build finished.\n');
} catch (error) {
  console.error('Chrome build failed. Aborting build.');
  process.exit(1);
}

console.log('--- Step 3: Building Firefox Target ---');
try {
  process.env.VITE_BROWSER = 'firefox';
  execSync('npx vite build', { stdio: 'inherit' });
  console.log('Firefox build finished.\n');
} catch (error) {
  console.error('Firefox build failed. Aborting build.');
  process.exit(1);
}

console.log('--- Build Process Completed Successfully ---');
console.log('Outputs are located in dist/chrome/ and dist/firefox/');

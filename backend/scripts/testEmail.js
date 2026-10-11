// npm run test:email -- --to someone@example.com
// Sends one sample email through the current .env SMTP config and exits with a
// clear message. Never logs credentials.
import { sendTestEmail } from '../src/services/emailService.js';

const args = process.argv.slice(2);
const toIndex = args.indexOf('--to');
const to = toIndex !== -1 ? args[toIndex + 1] : process.env.EMAIL_TEST_TO;

if (!to) {
  console.error('Usage: npm run test:email -- --to someone@example.com');
  process.exit(1);
}

const result = await sendTestEmail(to);
if (result.sent) {
  console.log(`OK - test email sent to ${to}. Check the inbox (and spam folder).`);
  process.exit(0);
}
console.error(`FAILED - ${result.reason}${result.error ? `: ${result.error}` : ''}`);
process.exit(1);
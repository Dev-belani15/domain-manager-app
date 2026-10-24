import readline from 'node:readline';
import { dbService } from '../db.js';
import { authService } from '../auth.js';

function ask(rl, question, isPassword = false) {
  return new Promise((resolve) => {
    if (!isPassword) {
      rl.question(question, (answer) => resolve(answer.trim()));
      return;
    }

    // Masked password input
    process.stdout.write(question);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }
    stdin.resume();

    let password = '';
    const onData = (char) => {
      const code = char.toString();
      if (code === '\n' || code === '\r' || code === '\u0004') {
        if (stdin.isTTY) stdin.setRawMode(wasRaw);
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(password);
      } else if (code === '\u0003') {
        // Ctrl+C
        process.exit(1);
      } else if (code === '\b' || code === '\x7f') {
        // Backspace
        if (password.length > 0) {
          password = password.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else {
        password += code;
        process.stdout.write('*');
      }
    };
    stdin.on('data', onData);
  });
}

export async function promptCreateAdmin() {
  console.log('\n======================================================');
  console.log('       DomainPortal - Administrator Setup CLI         ');
  console.log('======================================================');
  console.log('Zero hardcoded credentials: Create your secure master');
  console.log('administrator account stored with bcrypt encryption.\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    let name = await ask(rl, 'Enter Admin Name (default: "Administrator"): ');
    if (!name) name = 'Administrator';

    let email = '';
    while (!email || !email.includes('@')) {
      email = await ask(rl, 'Enter Admin Email: ');
      if (!email.includes('@')) {
        console.log('❌ Invalid email address. Please try again.');
      }
    }

    const existing = await dbService.getUserByEmail(email);
    if (existing) {
      console.log(`\n⚠️  An account with email "${email}" already exists (Role: ${existing.role}).`);
      const overwrite = await ask(rl, 'Reset this account password to make it admin? (y/N): ');
      if (overwrite.toLowerCase() !== 'y') {
        console.log('Setup aborted.');
        rl.close();
        return;
      }
    }

    let password = '';
    while (password.length < 6) {
      password = await ask(rl, 'Enter Secure Password (min 6 chars): ', true);
      if (password.length < 6) {
        console.log('❌ Password must be at least 6 characters long.\n');
      }
    }

    const confirmPassword = await ask(rl, 'Confirm Password: ', true);
    if (password !== confirmPassword) {
      console.log('❌ Passwords do not match. Setup aborted.\n');
      rl.close();
      return;
    }

    const passwordHash = authService.hashPassword(password);
    const now = new Date().toISOString().split('T')[0];

    if (existing) {
      // Delete existing and re-insert
      await dbService.deleteUser(existing.id);
    }

    const user = await dbService.createUser({
      id: 'usr_' + Date.now().toString(36),
      name,
      clientRef: 'Admin',
      email,
      passwordHash,
      role: 'admin',
      createdAt: now
    });

    console.log('\n✅ Master Administrator account created successfully!');
    console.log(`   - Name:  ${user.name}`);
    console.log(`   - Email: ${user.email}`);
    console.log(`   - Role:  ${user.role}`);
    console.log('   - Password securely hashed with bcrypt (never stored in plain text).\n');
  } finally {
    rl.close();
  }
}

// Support both CLI flags and interactive prompts
export async function runCli() {
  const args = process.argv.slice(2);
  let emailArg = null;
  let passArg = null;
  let nameArg = 'Administrator';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--email' && args[i + 1]) emailArg = args[++i];
    if (args[i] === '--password' && args[i + 1]) passArg = args[++i];
    if (args[i] === '--name' && args[i + 1]) nameArg = args[++i];
  }

  if (emailArg && passArg) {
    if (passArg.length < 6) {
      console.error('❌ Password must be at least 6 characters.');
      process.exit(1);
    }
    const existing = await dbService.getUserByEmail(emailArg);
    if (existing) {
      await dbService.deleteUser(existing.id);
    }
    const user = await dbService.createUser({
      id: 'usr_' + Date.now().toString(36),
      name: nameArg,
      clientRef: 'Admin',
      email: emailArg.trim().toLowerCase(),
      passwordHash: authService.hashPassword(passArg),
      role: 'admin',
      createdAt: new Date().toISOString().split('T')[0]
    });
    console.log(`✅ Master Administrator "${user.email}" provisioned securely via CLI.`);
    return;
  }

  await promptCreateAdmin();
}

// Run directly if invoked from command line
if (process.argv[1] && process.argv[1].endsWith('create-admin.js')) {
  runCli().catch((err) => {
    console.error('Admin creation error:', err);
    process.exit(1);
  });
}


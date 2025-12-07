#!/usr/bin/env node
/**
 * Seed script to populate the database with sample data
 * Run with: node scripts/seed-sample-data.js
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// Get database path (same as in main.js)
const userDataPath = process.env.APPDATA ||
  (process.platform === 'darwin'
    ? path.join(process.env.HOME, 'Library/Application Support')
    : path.join(process.env.HOME, '.local/share'));
const dbPath = path.join(userDataPath, 'notes-list', 'notes.db');

console.log('Database path:', dbPath);

// Load sql.js
const initSqlJs = require('sql.js');

async function seedDatabase() {
  const SQL = await initSqlJs();

  // Load existing database
  if (!fs.existsSync(dbPath)) {
    console.error('Database does not exist. Please run the app first.');
    process.exit(1);
  }

  const buffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(buffer);

  // Clear existing data
  db.run('DELETE FROM items');
  console.log('Cleared existing items');

  const now = new Date().toISOString();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Helper to create dates
  const daysFromNow = (days) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  };

  // Sample data structure
  const sampleItems = [
    // === Work Project ===
    { type: 'title', text: 'Work Project' },
    { type: 'todo', title: 'Review Q4 budget proposal', priority: 'high', dueDate: daysFromNow(-1), category: 'Finance', details: 'Check line items for marketing spend' },
    { type: 'todo', title: 'Prepare presentation slides', priority: 'high', dueDate: daysFromNow(0), category: 'Meetings' },
    { type: 'todo', title: 'Schedule team sync meeting', priority: 'medium', dueDate: daysFromNow(1), category: 'Meetings', indent: 1 },
    { type: 'todo', title: 'Send meeting invites', priority: 'low', dueDate: daysFromNow(1), indent: 2 },
    { type: 'todo', title: 'Update project roadmap', priority: 'medium', dueDate: daysFromNow(3), category: 'Planning' },
    { type: 'todo', title: 'Code review for PR #234', priority: 'high', dueDate: daysFromNow(0), category: 'Development', completed: true },
    { type: 'todo', title: 'Write documentation for API', priority: 'low', dueDate: daysFromNow(7), category: 'Development' },

    // === Personal ===
    { type: 'separator' },
    { type: 'title', text: 'Personal' },
    { type: 'todo', title: 'Book dentist appointment', priority: 'medium', dueDate: daysFromNow(2), category: 'Health' },
    { type: 'todo', title: 'Buy groceries', priority: 'low', dueDate: daysFromNow(0), category: 'Shopping', details: 'Milk, eggs, bread, vegetables' },
    { type: 'todo', title: 'Call mom for birthday', priority: 'high', dueDate: daysFromNow(5), category: 'Family' },
    { type: 'todo', title: 'Renew gym membership', priority: 'low', dueDate: daysFromNow(14), category: 'Health', completed: true },
    { type: 'todo', title: 'Plan weekend trip', priority: 'medium', category: 'Travel', details: 'Look into hiking trails nearby' },

    // === Learning ===
    { type: 'separator' },
    { type: 'title', text: 'Learning' },
    { type: 'todo', title: 'Complete TypeScript course', priority: 'medium', dueDate: daysFromNow(10), category: 'Education' },
    { type: 'todo', title: 'Watch module 5 videos', priority: 'low', dueDate: daysFromNow(3), category: 'Education', indent: 1 },
    { type: 'todo', title: 'Complete practice exercises', priority: 'low', dueDate: daysFromNow(5), category: 'Education', indent: 1 },
    { type: 'todo', title: 'Read "Clean Code" chapter 7', priority: 'low', category: 'Reading' },
    { type: 'todo', title: 'Practice piano - 30 min', priority: 'low', dueDate: daysFromNow(0), category: 'Hobbies', completed: true },

    // === Home ===
    { type: 'separator' },
    { type: 'title', text: 'Home' },
    { type: 'todo', title: 'Fix leaky faucet', priority: 'high', dueDate: daysFromNow(-2), category: 'Maintenance', details: 'Kitchen sink - need to buy new washer' },
    { type: 'todo', title: 'Clean garage', priority: 'low', dueDate: daysFromNow(7), category: 'Cleaning' },
    { type: 'todo', title: 'Organize closet', priority: 'low', category: 'Cleaning' },
    { type: 'todo', title: 'Pay electricity bill', priority: 'high', dueDate: daysFromNow(4), category: 'Bills', completed: true },
    { type: 'todo', title: 'Order new curtains', priority: 'low', dueDate: daysFromNow(21), category: 'Shopping' },

    // === Ungrouped tasks ===
    { type: 'separator' },
    { type: 'todo', title: 'Reply to John\'s email', priority: 'medium', dueDate: daysFromNow(0) },
    { type: 'todo', title: 'Backup laptop files', priority: 'low', dueDate: daysFromNow(14) },
    { type: 'todo', title: 'Research vacation destinations', priority: 'low', details: 'Consider Japan, Italy, or Iceland for next year' },
  ];

  // Insert items
  const insertStmt = db.prepare(`
    INSERT INTO items (id, type, position, parent_id, title, details, completed, status, priority, due_date, category, indent, ai_processing_status, text, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let currentParentId = null;

  sampleItems.forEach((item, index) => {
    const id = `sample-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`;

    // Track parent title for todos
    if (item.type === 'title') {
      currentParentId = id;
    } else if (item.type === 'separator') {
      currentParentId = null;
    }

    insertStmt.run([
      id,
      item.type,
      index,
      item.type === 'todo' ? currentParentId : null,
      item.title || null,
      item.details || null,
      item.completed ? 1 : 0,
      null, // status
      item.priority || null,
      item.dueDate || null,
      item.category || null,
      item.indent || 0,
      null, // ai_processing_status
      item.text || null,
      now,
      null // updated_at
    ]);
  });

  insertStmt.free();

  // Save database
  const data = db.export();
  const dbBuffer = Buffer.from(data);
  fs.writeFileSync(dbPath, dbBuffer);

  console.log(`Successfully seeded ${sampleItems.length} items!`);
  console.log('\nSample data includes:');
  console.log('- 4 project groups (Work, Personal, Learning, Home)');
  console.log('- Tasks with various priorities (high, medium, low)');
  console.log('- Tasks with different due dates (overdue, today, tomorrow, this week, later)');
  console.log('- Tasks with categories (Finance, Meetings, Health, etc.)');
  console.log('- Tasks with indentation (sub-tasks)');
  console.log('- Some completed tasks');
  console.log('- Some ungrouped tasks');
  console.log('\nRestart the app to see the changes!');

  db.close();
}

seedDatabase().catch(console.error);

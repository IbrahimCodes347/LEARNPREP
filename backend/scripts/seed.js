import { pathToFileURL } from 'url';
import { connectDb, disconnectDb } from '../src/config/db.js';
import { Question } from '../src/models/Question.js';
import { Test } from '../src/models/Test.js';
import { User } from '../src/models/User.js';
import { seedAdmin } from './seedAdmin.js';
import { ROLES, TEST_STATUS } from '../src/utils/constants.js';
import { createLogger } from '../src/utils/logger.js';

const log = createLogger('seed');

const BANK = [
  {
    subject: 'Data Structures',
    topic: 'Trees',
    difficulty: 'easy',
    questionText: 'What is the time complexity of inserting into a balanced Binary Search Tree?',
    options: ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'],
    correctIndex: 1,
    marks: 1,
    explanation: 'A balanced BST keeps height at O(log n), so search, insert and delete are all O(log n).'
  },
  {
    subject: 'Data Structures',
    topic: 'Trees',
    difficulty: 'medium',
    questionText: 'What is the worst-case time complexity of searching in an unbalanced BST?',
    options: ['O(log n)', 'O(n)', 'O(n log n)', 'O(log log n)'],
    correctIndex: 1,
    marks: 2,
    explanation: 'An unbalanced BST degenerates into a linked list, so a search becomes O(n).'
  },
  {
    subject: 'Data Structures',
    topic: 'Graphs',
    difficulty: 'easy',
    questionText: 'Which traversal of a binary search tree gives the nodes in sorted order?',
    options: ['Pre-order', 'Post-order', 'In-order', 'Level-order'],
    correctIndex: 2,
    marks: 1,
    explanation: 'In-order traversal visits left subtree, node, then right subtree - sorted for a BST.'
  },
  {
    subject: 'Data Structures',
    topic: 'Graphs',
    difficulty: 'hard',
    questionText: 'Dijkstra algorithm fails to produce correct shortest paths when the graph contains:',
    options: ['Cycles', 'Negative edge weights', 'More than 100 nodes', 'Disconnected components'],
    correctIndex: 1,
    marks: 2,
    explanation: 'Dijkstra assumes non-negative edge weights; a negative edge breaks the greedy finalisation.'
  },
  {
    subject: 'Data Structures',
    topic: 'Sorting',
    difficulty: 'medium',
    questionText: 'Which sorting algorithm is stable and has O(n log n) average time complexity?',
    options: ['Quicksort', 'Merge sort', 'Heapsort', 'Selection sort'],
    correctIndex: 1,
    marks: 2,
    explanation: 'Merge sort is stable by merging equal keys in order, and averages O(n log n).'
  },
  {
    subject: 'Database Management Systems',
    topic: 'Normalization',
    difficulty: 'easy',
    questionText: 'Which normal form removes partial dependency on a composite key?',
    options: ['1NF', '2NF', '3NF', 'BCNF'],
    correctIndex: 1,
    marks: 1,
    explanation: 'Second Normal Form removes partial dependency on part of a composite primary key.'
  },
  {
    subject: 'Database Management Systems',
    topic: 'Normalization',
    difficulty: 'medium',
    questionText: '3NF additionally requires that no non-key attribute depends on another non-key attribute. This is called:',
    options: ['Referential integrity', 'Transitive dependency removal', 'Entity integrity', 'Domain constraint'],
    correctIndex: 1,
    marks: 2,
    explanation: '3NF removes transitive dependencies between non-key attributes.'
  },
  {
    subject: 'Database Management Systems',
    topic: 'SQL',
    difficulty: 'medium',
    questionText: 'Which SQL clause filters aggregated groups?',
    options: ['WHERE', 'HAVING', 'ORDER BY', 'GROUP BY'],
    correctIndex: 1,
    marks: 1,
    explanation: 'WHERE filters rows before grouping; HAVING filters the groups afterwards.'
  },
  {
    subject: 'Database Management Systems',
    topic: 'Transactions',
    difficulty: 'hard',
    questionText: 'Under which isolation level can a non-repeatable read occur?',
    options: ['Serializable', 'Repeatable Read', 'Read Committed', 'Read Uncommitted'],
    correctIndex: 3,
    marks: 2,
    explanation: 'Read Uncommitted allows dirty and non-repeatable reads; Serializable prevents both.'
  },
  {
    subject: 'Operating Systems',
    topic: 'Processes',
    difficulty: 'easy',
    questionText: 'Which scheduling algorithm can cause starvation?',
    options: ['FCFS', 'Round Robin', 'Priority', 'SJF non-preemptive'],
    correctIndex: 2,
    marks: 1,
    explanation: 'Priority scheduling can starve low-priority processes when higher-priority ones keep arriving.'
  },
  {
    subject: 'Operating Systems',
    topic: 'Memory',
    difficulty: 'medium',
    questionText: 'Page fault occurs when a referenced page is:',
    options: ['Not in physical memory', 'Already in cache', 'Read-only', 'Locked by another process'],
    correctIndex: 0,
    marks: 1,
    explanation: 'The MMU raises a fault when the page table entry is invalid, so the OS loads the page.'
  },
  {
    subject: 'Operating Systems',
    topic: 'Deadlock',
    difficulty: 'hard',
    questionText: 'Which is NOT one of the Coffman conditions for deadlock?',
    options: ['Mutual exclusion', 'Hold and wait', 'Preemption', 'Circular wait'],
    correctIndex: 2,
    marks: 2,
    explanation: 'Preemption is deliberately absent - the four conditions are exclusion, hold-and-wait, no preemption, circular wait.'
  },
  {
    subject: 'Computer Networks',
    topic: 'TCP/IP',
    difficulty: 'easy',
    questionText: 'Which protocol guarantees ordered and reliable delivery?',
    options: ['UDP', 'TCP', 'IP', 'ICMP'],
    correctIndex: 1,
    marks: 1,
    explanation: 'TCP uses sequence numbers and acknowledgements to guarantee ordered, reliable delivery.'
  },
  {
    subject: 'Computer Networks',
    topic: 'TCP/IP',
    difficulty: 'medium',
    questionText: 'Which TCP mechanism recovers lost data?',
    options: ['Sliding window', 'Congestion control', 'Retransmission timer', 'Flow control'],
    correctIndex: 2,
    marks: 2,
    explanation: 'The retransmission timer triggers a retransmit when an ACK does not arrive in time.'
  },
  {
    subject: 'Computer Networks',
    topic: 'HTTP',
    difficulty: 'medium',
    questionText: 'Which HTTP status code means the request was successful but returned no body?',
    options: ['200 OK', '204 No Content', '304 Not Modified', '404 Not Found'],
    correctIndex: 1,
    marks: 1,
    explanation: '204 No Content signals success with no payload. 304 is a cache revalidation response.'
  },
  {
    subject: 'Object Oriented Programming',
    topic: 'OOP Basics',
    difficulty: 'easy',
    questionText: 'Which principle says a subclass instance must be usable wherever the parent is expected?',
    options: ['Encapsulation', 'Abstraction', 'Liskov Substitution', 'Polymorphism'],
    correctIndex: 2,
    marks: 1,
    explanation: 'Liskov Substitution Principle - a subtype must preserve the behaviour of its base type.'
  },
  {
    subject: 'Object Oriented Programming',
    topic: 'Design Patterns',
    difficulty: 'medium',
    questionText: 'Which pattern ensures a class has only one instance?',
    options: ['Factory', 'Singleton', 'Observer', 'Adapter'],
    correctIndex: 1,
    marks: 1,
    explanation: 'Singleton restricts instantiation to one shared instance, e.g. a database connection pool.'
  },
  {
    subject: 'Software Engineering',
    topic: 'Agile',
    difficulty: 'easy',
    questionText: 'In Scrum, what is the maximum timebox of a Daily Scrum?',
    options: ['8 hours', '4 hours', '15 minutes', '30 minutes'],
    correctIndex: 2,
    marks: 1,
    explanation: 'The Daily Scrum is a 15-minute event; a Sprint is one month or less.'
  },
  {
    subject: 'Software Engineering',
    topic: 'Testing',
    difficulty: 'medium',
    questionText: 'White-box testing derives test cases from:',
    options: ['The specification only', 'Internal code structure', 'User stories', 'The deployed system'],
    correctIndex: 1,
    marks: 2,
    explanation: 'White-box testing inspects internal paths and branches, hence higher coverage, not fewer bugs.'
  },
  {
    subject: 'Software Engineering',
    topic: 'Testing',
    difficulty: 'hard',
    questionText: 'Which metric estimates the probability of a failure given that a failure already occurred?',
    options: ['Mutation score', 'Coupling', 'Conditional probability', 'Halstead volume'],
    correctIndex: 2,
    marks: 2,
    explanation: 'Mutation score approximates conditional probability by counting surviving mutants as failures missed.'
  }
];

async function seedQuestions(adminId) {
  const existing = await Question.countDocuments();
  if (existing >= BANK.length) {
    log.info(`question bank already has ${existing} question(s) - skipping`);
    return;
  }

  const byText = new Set((await Question.find().select('questionText').lean()).map((q) => q.questionText));
  const toInsert = BANK.filter((q) => !byText.has(q.questionText)).map((q) => ({ ...q, createdBy: adminId }));

  if (toInsert.length) await Question.insertMany(toInsert);
  log.info(`inserted ${toInsert.length} question(s); bank now has ${await Question.countDocuments()}`);
}

async function seedDemoStudent(adminId) {
  const username = 'student';
  const existing = await User.findOne({ username });
  if (existing) {
    log.info('demo student already exists');
    return existing;
  }

  const student = new User({
    name: 'Demo Student',
    username,
    email: 'student@learnprep.dev',
    rollno: 'TYCS-000',
    grade: 'TYCS Sem V',
    role: ROLES.STUDENT,
    createdBy: adminId
  });
  await student.setPassword('Student@123');
  await student.save();
  log.info('demo student created - student / Student@123');
  return student;
}

async function seedTests(adminId) {
  const titles = [
    { title: 'Data Structures - Full Syllabus Mock', subject: 'Data Structures', count: 5, durationMinutes: 20, negativeMarks: 0.25, passMarks: 4 },
    { title: 'DBMS Quick Test', subject: 'Database Management Systems', count: 4, durationMinutes: 15, negativeMarks: 0.25, passMarks: 3 },
    { title: 'Operating Systems & Networks Mixed', subject: 'Operating Systems', count: 5, durationMinutes: 25, negativeMarks: 0, passMarks: null }
  ];

  for (const spec of titles) {
    const exists = await Test.findOne({ title: spec.title });
    if (exists) {
      log.info(`test "${spec.title}" already exists`);
      continue;
    }

    const pool = await Question.find({ subject: spec.subject, isDeleted: false }).select('_id marks').lean();
    const useCount = Math.min(spec.count, pool.length);
    if (useCount === 0) continue;

    const chosen = pool.slice(0, useCount);
    await Test.create({
      title: spec.title,
      subject: spec.subject,
      description: `${spec.subject} mock test generated from the demo question bank.`,
      durationMinutes: spec.durationMinutes,
      questionIds: chosen.map((q) => q._id),
      totalMarks: chosen.reduce((sum, q) => sum + (q.marks ?? 1), 0),
      negativeMarks: spec.negativeMarks,
      passMarks: spec.passMarks,
      shuffle: true,
      isAdaptive: false,
      status: TEST_STATUS.ACTIVE,
      activeFrom: new Date(Date.now() - 60_000),
      activeUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      createdBy: adminId
    });
    log.info(`test "${spec.title}" created with ${useCount} question(s)`);
  }
}

export async function seed() {
  const admin = await seedAdmin();
  await seedQuestions(admin._id);
  await seedDemoStudent(admin._id);
  await seedTests(admin._id);
  log.info('seed complete');
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  connectDb()
    .then(seed)
    .then(async () => {
      await disconnectDb();
      process.exit(0);
    })
    .catch((err) => {
      log.error('seed failed:', err.message);
      process.exit(1);
    });
}

export default seed;
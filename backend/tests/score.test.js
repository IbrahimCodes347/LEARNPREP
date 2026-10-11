import { scoreAttempt, findWeakTopics } from '../src/services/scoreService.js';

const q = (id, opts = {}) => ({
  _id: id,
  topic: opts.topic ?? 'Trees',
  marks: opts.marks ?? 1,
  correctIndex: opts.correctIndex ?? 0
});

describe('scoreService', () => {
  test('counts correct, wrong and unattempted', () => {
    const result = scoreAttempt({
      questions: [q('a'), q('b'), q('c'), q('d')],
      responses: [
        { questionId: 'a', selectedIndex: 0 }, // correct
        { questionId: 'b', selectedIndex: 1 }, // wrong
        { questionId: 'c', selectedIndex: null }, // skipped
        { questionId: 'd', selectedIndex: 0 } // correct
      ]
    });

    expect(result.correct).toBe(2);
    expect(result.wrong).toBe(1);
    expect(result.unattempted).toBe(1);
    expect(result.totalMarks).toBe(4);
    expect(result.score).toBe(2);
    expect(result.percentage).toBe(50);
  });

  test('applies negative marks and clamps the score at 0', () => {
    const result = scoreAttempt({
      questions: [q('a'), q('b'), q('c'), q('d'), q('e')],
      responses: [
        { questionId: 'a', selectedIndex: 1 },
        { questionId: 'b', selectedIndex: 1 },
        { questionId: 'c', selectedIndex: 1 },
        { questionId: 'd', selectedIndex: 1 },
        { questionId: 'e', selectedIndex: null }
      ],
      negativeMarks: 1
    });

    expect(result.wrong).toBe(4);
    expect(result.score).toBe(0);
    expect(result.percentage).toBe(0);
  });

  test('negative marks can push the raw score below zero without going negative', () => {
    const result = scoreAttempt({
      questions: [q('a'), q('b', { marks: 2 })],
      responses: [
        { questionId: 'a', selectedIndex: 1 },
        { questionId: 'b', selectedIndex: 2 }
      ],
      negativeMarks: 0.5
    });

    expect(result.score).toBe(0); // 0 - 1 clamped, never negative
  });

  test('honours per-question marks and rounds to 2 decimals', () => {
    const result = scoreAttempt({
      questions: [q('a', { marks: 1.5 }), q('b', { marks: 2.25 }), q('c', { marks: 3 })],
      responses: [
        { questionId: 'a', selectedIndex: 0 },
        { questionId: 'b', selectedIndex: 0 },
        { questionId: 'c', selectedIndex: 1 }
      ]
    });

    expect(result.totalMarks).toBe(6.75);
    expect(result.score).toBe(3.75);
    expect(result.percentage).toBe(55.56); // 3.75/6.75 = 55.555...
  });

  test('passed is null when passMarks is not set', () => {
    const result = scoreAttempt({ questions: [q('a')], responses: [{ questionId: 'a', selectedIndex: 0 }] });
    expect(result.passed).toBeNull();
  });

  test('passed compares the clamped score against passMarks', () => {
    const below = scoreAttempt({
      questions: [q('a'), q('b')],
      responses: [
        { questionId: 'a', selectedIndex: 1 },
        { questionId: 'b', selectedIndex: 1 }
      ],
      negativeMarks: 1,
      passMarks: 2
    });
    expect(below.passed).toBe(false);

    const above = scoreAttempt({
      questions: [q('a')],
      responses: [{ questionId: 'a', selectedIndex: 0 }],
      passMarks: 1
    });
    expect(above.passed).toBe(true);
  });

  test('treats a missing response the same as an unanswered question', () => {
    const result = scoreAttempt({ questions: [q('a'), q('b')], responses: [{ questionId: 'a', selectedIndex: 0 }] });
    expect(result.unattempted).toBe(1);
    expect(result.wrong).toBe(0);
  });

  test('handles an empty test without dividing by zero', () => {
    const result = scoreAttempt({ questions: [], responses: [] });
    expect(result.totalMarks).toBe(0);
    expect(result.percentage).toBe(0);
    expect(result.score).toBe(0);
  });

  test('returns per-question detail with correct answers', () => {
    const result = scoreAttempt({
      questions: [q('a'), q('b')],
      responses: [
        { questionId: 'a', selectedIndex: 0 },
        { questionId: 'b', selectedIndex: 1 }
      ],
      negativeMarks: 0.5
    });

    expect(result.detail).toEqual([
      expect.objectContaining({ questionId: 'a', isCorrect: true, awarded: 1 }),
      expect.objectContaining({ questionId: 'b', isCorrect: false, awarded: -0.5 })
    ]);
  });
});

describe('weak topics', () => {
  test('flags a topic only below 50% accuracy', () => {
    const weak = findWeakTopics([
      { topic: 'Trees', correct: 1, total: 4 }, // 25% -> weak
      { topic: 'Graphs', correct: 2, total: 4 }, // 50% -> not weak
      { topic: 'Sorting', correct: 4, total: 4 } // 100% -> not weak
    ]);

    expect(weak).toEqual(['Trees']);
  });

  test('excludes a topic sitting exactly at the 50% threshold', () => {
    const weak = findWeakTopics([
      { topic: 'B', correct: 2, total: 4 }, // exactly 50% -> not weak
      { topic: 'A', correct: 0, total: 2 }, // 0% -> weakest, first
      { topic: 'C', correct: 3, total: 5 } // 60% -> not weak
    ]);

    expect(weak).toEqual(['A']);
  });

  test('sorts multiple weak topics worst-first', () => {
    const weak = findWeakTopics([
      { topic: 'Mid', correct: 1, total: 4 }, // 25%
      { topic: 'Worst', correct: 0, total: 2 }, // 0%
      { topic: 'Slight', correct: 1, total: 3 } // 33.3%
    ]);

    expect(weak).toEqual(['Worst', 'Mid', 'Slight']);
  });

  test('caps the list at five topics', () => {
    const buckets = Array.from({ length: 12 }, (_, i) => ({ topic: `T${i}`, correct: 0, total: 3 }));
    expect(findWeakTopics(buckets)).toHaveLength(5);
  });

  test('an unattempted-only topic counts as weak via the result flow', () => {
    const result = scoreAttempt({
      questions: [q('a', { topic: 'Trees' }), q('b', { topic: 'Trees' })],
      responses: [
        { questionId: 'a', selectedIndex: null },
        { questionId: 'b', selectedIndex: null }
      ]
    });

    expect(result.weakTopics).toEqual(['Trees']);
  });
});
import { MAX_WEAK_TOPICS, SCORE, WEAK_TOPIC_RATIO } from '../utils/constants.js';
import { round2 } from '../utils/id.js';

const normalizeTopic = (topic) => String(topic ?? '').trim() || 'General';

/**
 * Pure scoring function. `questions` must include `marks` and `correctIndex`.
 * `responses` maps questionId -> selectedIndex|null.
 */
export function scoreAttempt({ questions, responses, negativeMarks = 0, passMarks = null }) {
  const list = Array.isArray(questions) ? questions : [];
  const answerMap = new Map(
    (Array.isArray(responses) ? responses : []).map((r) => [String(r.questionId), r.selectedIndex])
  );

  const topics = new Map();
  let score = 0;
  let correct = 0;
  let wrong = 0;
  let unattempted = 0;
  const totalMarks = list.reduce((sum, q) => sum + (Number(q.marks) || 0), 0);

  const detail = list.map((q) => {
    const topic = normalizeTopic(q.topic);
    const selected = answerMap.has(String(q._id ?? q.id)) ? answerMap.get(String(q._id ?? q.id)) : null;
    const isCorrect = selected !== null && selected !== undefined && selected === q.correctIndex;
    let awarded = 0;

    if (selected === null || selected === undefined) {
      unattempted += 1;
    } else if (isCorrect) {
      awarded = Number(q.marks) || 0;
      correct += 1;
    } else {
      awarded = -(Number(negativeMarks) || 0);
      wrong += 1;
    }

    score += awarded;

    const bucket = topics.get(topic) ?? { topic, correct: 0, total: 0 };
    bucket.total += 1;
    if (isCorrect) bucket.correct += 1;
    topics.set(topic, bucket);

    return {
      questionId: String(q._id ?? q.id),
      selectedIndex: selected ?? null,
      correctIndex: q.correctIndex,
      isCorrect,
      marks: Number(q.marks) || 0,
      topic,
      awarded: round2(awarded)
    };
  });

  const clamped = Math.max(SCORE.MIN, round2(score));
  const percentage = totalMarks > 0 ? round2((clamped / totalMarks) * 100) : 0;

  return {
    score: clamped,
    totalMarks: round2(totalMarks),
    percentage,
    correct,
    wrong,
    unattempted,
    weakTopics: findWeakTopics([...topics.values()]),
    passed: passMarks === null || passMarks === undefined ? null : clamped >= passMarks,
    detail
  };
}

/** Topics where accuracy < 50%, worst first, capped at MAX_WEAK_TOPICS. */
export function findWeakTopics(buckets, ratio = WEAK_TOPIC_RATIO) {
  return buckets
    .filter((b) => b.total > 0 && b.correct / b.total < ratio)
    .sort((a, b) => a.correct / a.total - b.correct / b.total)
    .slice(0, MAX_WEAK_TOPICS)
    .map((b) => b.topic);
}

export default { scoreAttempt, findWeakTopics };

export const FEEDBACK_CATEGORIES = ["bug", "idea", "question", "other"] as const;

export type FeedbackCategory = (typeof FEEDBACK_CATEGORIES)[number];

export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  bug: "Bug",
  idea: "Idea",
  question: "Question",
  other: "Other",
};

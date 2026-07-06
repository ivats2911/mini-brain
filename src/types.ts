export type ThoughtSource = 'typed' | 'voice';
export type CategorySource = 'auto' | 'manual';

export type Thought = {
  id: string; // nanoid
  text: string;
  categoryId: string;
  categorySource: CategorySource;
  createdAt: number;
  source: ThoughtSource;
};

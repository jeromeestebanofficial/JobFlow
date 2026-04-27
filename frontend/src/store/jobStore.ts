import { create } from "zustand";
import type { Job } from "../types";

interface JobState {
  jobs: Job[];
  swipeQueue: Job[];
  currentSwipeIndex: number;
  isLoading: boolean;
  searchQuery: string;
  setJobs: (jobs: Job[]) => void;
  setSwipeQueue: (jobs: Job[]) => void;
  advanceSwipe: () => void;
  setLoading: (v: boolean) => void;
  setSearchQuery: (q: string) => void;
}

export const useJobStore = create<JobState>((set) => ({
  jobs: [],
  swipeQueue: [],
  currentSwipeIndex: 0,
  isLoading: false,
  searchQuery: "",

  setJobs: (jobs) => set({ jobs }),
  setSwipeQueue: (jobs) => set({ swipeQueue: jobs, currentSwipeIndex: 0 }),
  advanceSwipe: () => set((s) => ({ currentSwipeIndex: s.currentSwipeIndex + 1 })),
  setLoading: (isLoading) => set({ isLoading }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
}));

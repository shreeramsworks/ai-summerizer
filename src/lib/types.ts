
export interface SummaryItem {
  id: string;
  user_id: string;
  transcript: string;
  summary: string;
  timestamp: string;
}

export interface Reminder {
  id: string;
  user_id: string;
  text: string;
  remindAt: string;
  summaryId: string | null;
  timestamp: string;
  completed: boolean;
}

export interface Note {
  id: string;
  user_id: string;
  summary_id: string | null;
  title: string;
  key_discussions: string[];
  decisions_made: string[];
  timestamp: string;
}

    
export type PassRecord = {
  id: string;
  user_id: string;
  event_id: string;
  pass_type: string | null;
  status: string | null;
  pass_number: string | null;
  max_meeting_requests: number | null;
  used_meeting_requests: number | null;
  max_boost_amount: number | null;
  used_boost_amount: number | null;
  created_at: string | null;
  updated_at: string | null;
};

export type BookingInput = {
  speakerId: string;
  attendeeId: string;
  start: string;
  end: string;
};

export function isIsoDateString(value: string): boolean {
  const d = new Date(value);
  return !isNaN(d.getTime()) && /\d{4}-\d{2}-\d{2}T/.test(value);
}

export function validateBookingInput(input: Partial<BookingInput>): string | null {
  if (!input.speakerId) return 'speakerId is required';
  if (!input.attendeeId) return 'attendeeId is required';
  if (!input.start) return 'start is required';
  if (!input.end) return 'end is required';
  if (!isIsoDateString(input.start!)) return 'start must be ISO datetime';
  if (!isIsoDateString(input.end!)) return 'end must be ISO datetime';
  const start = new Date(input.start!);
  const end = new Date(input.end!);
  if (end <= start) return 'end must be after start';
  const diffMin = (end.getTime() - start.getTime()) / 60000;
  if (diffMin < 5 || diffMin > 30) return 'slot duration must be between 5 and 30 minutes';
  return null;
}



export type AdminEventFilter = "upcoming" | "past" | "all";

export type AdminEventSelectorAnchor = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AdminEventOption = {
  eventId: string;
  label: string;
  detail: string;
  searchText: string;
  startDate?: string;
  endDate?: string;
  isSeriesHub: boolean;
  hasUpcomingChildren: boolean;
};

export type EventAdminSelectorProps = {
  options: AdminEventOption[];
  selectedEventId: string;
  mode: "light" | "dark";
  onSelect: (eventId: string) => void;
};

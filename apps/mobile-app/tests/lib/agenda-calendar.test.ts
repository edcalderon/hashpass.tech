import {
  buildGoogleCalendarUrl,
  buildICalendarFile,
  createAgendaCalendarEvent,
  resolveAgendaCalendarSpeakerNames,
} from "../../lib/agenda-calendar";

const source = {
  eventId: "colombia2026",
  eventName: "Blockchain Summit Latam Colombia",
  eventStartDate: "2026-08-05T09:00:00-05:00",
  eventTimezoneOffset: "-05:00",
  agendaUrl: "https://hashpass.tech/events/colombia2026/agenda?session=opening-keynote",
  item: {
    id: "opening-keynote",
    day: "Day 2",
    time: "09:30 - 10:45",
    title: "Opening: Web3 in Latin America",
    description: "The main conference opening.",
    speakers: ["Ada Lovelace", "Grace Hopper"],
    location: "Main Stage",
  },
};

describe("agenda calendar links", () => {
  it("uses the event-local day and time range to make a portable calendar event", () => {
    expect(createAgendaCalendarEvent(source)).toEqual(expect.objectContaining({
      title: "Opening: Web3 in Latin America",
      start: new Date("2026-08-06T14:30:00.000Z"),
      end: new Date("2026-08-06T15:45:00.000Z"),
      location: "Main Stage",
      url: source.agendaUrl,
    }));
  });

  it.each([
    ["panel", "2026-08-06T15:30:00.000Z"],
    ["meal", "2026-08-06T15:30:00.000Z"],
    ["break", "2026-08-06T14:45:00.000Z"],
  ])("uses the agenda type fallback for a live %s session", (type, endTime) => {
    const calendarEvent = createAgendaCalendarEvent({
      ...source,
      item: {
        ...source.item,
        time: "2026-08-06T09:30:00-05:00",
        type,
      },
    });

    expect(calendarEvent.end).toEqual(new Date(endTime));
  });

  it("uses resolved speaker names instead of agenda references in calendar details", () => {
    const namesByReference = new Map([
      ["paul-castillo", "Paul Castillo"],
      ["a1b2c3d4", "Ada Lovelace"],
    ]);
    const speakers = resolveAgendaCalendarSpeakerNames(
      ["paul-castillo", "a1b2c3d4"],
      (reference) => namesByReference.get(reference) || reference,
    );
    const calendarEvent = createAgendaCalendarEvent({
      ...source,
      item: { ...source.item, speakers },
    });

    expect(calendarEvent.description).toContain("Speakers: Paul Castillo, Ada Lovelace");
    expect(calendarEvent.description).not.toContain("paul-castillo");
    expect(calendarEvent.description).not.toContain("a1b2c3d4");
  });

  it("creates a Google Calendar URL with session details and an iCalendar file for other calendar apps", () => {
    const calendarEvent = createAgendaCalendarEvent(source);
    const googleUrl = new URL(buildGoogleCalendarUrl(calendarEvent));
    const ics = buildICalendarFile(calendarEvent, new Date("2026-01-01T00:00:00.000Z"));

    expect(googleUrl.origin).toBe("https://calendar.google.com");
    expect(googleUrl.searchParams.get("action")).toBe("TEMPLATE");
    expect(googleUrl.searchParams.get("dates")).toBe("20260806T143000Z/20260806T154500Z");
    expect(googleUrl.searchParams.get("location")).toBe("Main Stage");
    expect(googleUrl.searchParams.get("details")).toContain(source.agendaUrl);
    expect(ics).toContain("DTSTART:20260806T143000Z");
    expect(ics).toContain("DTEND:20260806T154500Z");
    expect(ics).toContain("LOCATION:Main Stage");
    expect(ics).toContain(`URL:${source.agendaUrl}`);
    expect(ics).toContain("Ada Lovelace\\, Grace Hopper");
  });
});

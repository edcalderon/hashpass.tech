/// <reference types="jest" />

import { EVENTS, type AgendaItem } from "../../config/events";

describe("Colombia 2026 published agenda", () => {
  it("keeps an official Externado room on every session", () => {
    const event = EVENTS.colombia2026;
    const agenda: AgendaItem[] = event.agenda ?? [];

    expect(event.tour?.venue).toBe(
      "Edificios H e I · Universidad Externado de Colombia, La Candelaria, Bogotá",
    );
    expect(agenda).toHaveLength(36);
    expect(agenda.every((item) => Boolean(item.location))).toBe(true);
    expect(new Set(agenda.map((item) => item.location))).toEqual(
      new Set(["Auditorio", "Panel central", "Hall principal"]),
    );
    expect(
      agenda
        .filter((item) => item.type === "panel")
        .every((item) => item.location === "Panel central"),
    ).toBe(true);
    expect(
      agenda
        .filter((item) => item.type === "networking" || item.type === "meal")
        .every((item) => item.location === "Hall principal"),
    ).toBe(true);
  });
});
